/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, 
  PenTool, 
  Bell, 
  StickyNote, 
  TrendingUp, 
  Plus, 
  Trash2, 
  CheckCircle, 
  Clock, 
  LogOut, 
  Sparkles, 
  ChevronRight,
  Send,
  Calendar as CalendarIcon,
  Search,
  MoreVertical,
  ExternalLink,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  deleteDoc, 
  doc, 
  updateDoc, 
  serverTimestamp,
  orderBy,
  getDocs
} from 'firebase/firestore';
import { format, isAfter, parseISO } from 'date-fns';
import Markdown from 'react-markdown';
import { Toaster, toast } from 'sonner';
import { auth, db } from './firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface PostSuggestion {
  id: string;
  content: string;
  platform: string;
  trend: string;
  createdAt: any;
}

interface Reminder {
  id: string;
  title: string;
  postContent: string;
  scheduledTime: string;
  status: 'pending' | 'completed';
  createdAt: any;
}

interface Note {
  id: string;
  title: string;
  content: string;
  category: string;
  updatedAt: any;
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}: any) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 shadow-sm',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };
  
  return (
    <button 
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant as keyof typeof variants],
        sizes[size as keyof typeof sizes],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className }: any) => (
  <div className={cn('bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden', className)}>
    {children}
  </div>
);

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import React from 'react';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) errorMessage = `Firestore Error: ${parsed.error}`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-red-100 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Bell className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Error</h2>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="w-full">Reload Application</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'ai' | 'reminders' | 'notes'>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  // Manual Auth State
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  // Data States
  const [posts, setPosts] = useState<PostSuggestion[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  
  // AI State
  const [aiInput, setAiInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    const qPosts = query(collection(db, 'posts'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const qReminders = query(collection(db, 'reminders'), where('uid', '==', user.uid), orderBy('scheduledTime', 'asc'));
    const qNotes = query(collection(db, 'notes'), where('uid', '==', user.uid), orderBy('updatedAt', 'desc'));

    const unsubPosts = onSnapshot(qPosts, (snap) => {
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as PostSuggestion)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'posts'));

    const unsubReminders = onSnapshot(qReminders, (snap) => {
      setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reminder)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reminders'));

    const unsubNotes = onSnapshot(qNotes, (snap) => {
      setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Note)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notes'));

    return () => {
      unsubPosts();
      unsubReminders();
      unsubNotes();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success('Successfully logged in!');
    } catch (error) {
      console.error(error);
      toast.error('Login failed. Please try again.');
    }
  };

  const handleLogout = () => signOut(auth);

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName });
        toast.success('Account created successfully!');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Logged in successfully!');
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const generateAIContent = async () => {
    if (!aiInput.trim()) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `As a social media expert for small businesses, suggest 3 creative post ideas for ${aiInput}. 
        Include hashtags and a brief explanation of why these work for current trends. 
        Format as clear markdown with sections for each idea.`
      });
      const result = await model;
      setGeneratedContent(result.text || '');
      
      // Save to history
      if (user) {
        try {
          await addDoc(collection(db, 'posts'), {
            uid: user.uid,
            content: result.text,
            platform: 'Multi-platform',
            trend: aiInput,
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'posts');
        }
      }
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate content.');
    } finally {
      setIsGenerating(false);
    }
  };

  const addReminder = async (title: string, time: string, content: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'reminders'), {
        uid: user.uid,
        title,
        postContent: content,
        scheduledTime: time,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      toast.success('Reminder set!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reminders');
    }
  };

  const deleteItem = async (col: string, id: string) => {
    try {
      await deleteDoc(doc(db, col, id));
      toast.success('Item deleted');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `${col}/${id}`);
    }
  };

  const toggleReminder = async (id: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'reminders', id), {
        status: currentStatus === 'pending' ? 'completed' : 'pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `reminders/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Abstract Background */}
        <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500 rounded-full blur-[120px]"></div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-medium mb-4">
              <Sparkles className="w-4 h-4 mr-2" />
              AI-Powered Social Growth for SMBs
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-2 bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
              SMB AI Content Hub
            </h1>
            <p className="text-slate-400">
              {isSignUp ? 'Create your account to get started' : 'Sign in to manage your content'}
            </p>
          </div>

          <Card className="p-8 bg-slate-900/50 border-slate-800 backdrop-blur-xl">
            <form onSubmit={handleManualAuth} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                  <input 
                    type="text" 
                    required 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white" 
                    placeholder="John Doe"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                <input 
                  type="email" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white" 
                  placeholder="name@company.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                <input 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white" 
                  placeholder="••••••••"
                />
              </div>
              <Button 
                type="submit" 
                disabled={authLoading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {authLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : (
                  isSignUp ? 'Create Account' : 'Sign In'
                )}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-2 text-slate-500">Or continue with</span>
              </div>
            </div>

            <Button 
              onClick={handleLogin}
              variant="secondary"
              className="w-full py-3 bg-white text-slate-950 hover:bg-slate-100 border-none"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 mr-2" alt="Google" />
              Google
            </Button>

            <p className="mt-6 text-center text-sm text-slate-400">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button 
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-indigo-400 font-semibold hover:text-indigo-300"
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      <Toaster position="top-right" />
      
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <span>ContentHub</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="w-6 h-6" />
        </button>
      </div>

      {/* Sidebar Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 lg:hidden"
          />
        )}
      </AnimatePresence>
      
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 flex flex-col z-50 transition-transform duration-300 transform lg:translate-x-0 lg:static lg:w-64 lg:h-screen lg:sticky lg:top-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3 text-indigo-600 font-bold text-xl">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                <Sparkles className="w-6 h-6" />
              </div>
              <span>ContentHub</span>
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <nav className="space-y-1">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
              { id: 'ai', icon: PenTool, label: 'AI Generator' },
              { id: 'reminders', icon: Bell, label: 'Reminders' },
              { id: 'notes', icon: StickyNote, label: 'Notes & Resources' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as any);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  activeTab === item.id 
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-gray-100">
            <div className="flex items-center gap-3 mb-4">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || 'User')}&background=6366f1&color=fff`} 
                alt={user.displayName || ''} 
                className="w-10 h-10 rounded-full border border-gray-200"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full max-w-full">
        <header className="mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 capitalize">{activeTab}</h2>
            <p className="text-sm md:text-base text-gray-500 mt-1">
              {activeTab === 'dashboard' && "Welcome back! Here's what's happening today."}
              {activeTab === 'ai' && "Generate fresh ideas for your social media."}
              {activeTab === 'reminders' && "Never miss a post with scheduled reminders."}
              {activeTab === 'notes' && "Keep your business resources organized."}
            </p>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              <Card className="p-6 md:col-span-2">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    Recent AI Suggestions
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab('ai')}>View All</Button>
                </div>
                <div className="space-y-4">
                  {posts.slice(0, 3).map((post) => (
                    <div key={post.id} className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{post.trend}</span>
                        <span className="text-xs text-gray-400">{format(new Date(post.createdAt), 'MMM d, h:mm a')}</span>
                      </div>
                      <p className="text-gray-700 text-sm line-clamp-3 mb-3">{post.content}</p>
                      <Button variant="secondary" size="sm" className="text-xs">Copy Content</Button>
                    </div>
                  ))}
                  {posts.length === 0 && (
                    <div className="text-center py-12 text-gray-400">
                      No suggestions yet. Try the AI Generator!
                    </div>
                  )}
                </div>
              </Card>

              <div className="space-y-6">
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-indigo-600" />
                    Upcoming
                  </h3>
                  <div className="space-y-3">
                    {reminders.filter(r => r.status === 'pending').slice(0, 4).map((reminder) => (
                      <div key={reminder.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{reminder.title}</p>
                          <p className="text-xs text-gray-500">{format(new Date(reminder.scheduledTime), 'MMM d, h:mm a')}</p>
                        </div>
                        <button onClick={() => toggleReminder(reminder.id, reminder.status)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600">
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      </div>
                    ))}
                    {reminders.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No reminders set.</p>}
                  </div>
                </Card>

                <Card className="p-6 bg-indigo-600 text-white border-none">
                  <h3 className="font-bold text-lg mb-2">Quick Tip</h3>
                  <p className="text-indigo-100 text-sm leading-relaxed">
                    Consistency is key! Try to post at least 3 times a week to keep your audience engaged.
                  </p>
                  <Button variant="secondary" size="sm" className="mt-4 w-full bg-white/10 border-white/20 text-white hover:bg-white/20">
                    Learn More
                  </Button>
                </Card>
              </div>
            </motion.div>
          )}

          {activeTab === 'ai' && (
            <motion.div 
              key="ai"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto"
            >
              <Card className="p-6 md:p-8 mb-8">
                <h3 className="text-lg md:text-xl font-bold mb-4">What's your business focus today?</h3>
                <div className="flex flex-col sm:flex-row gap-4">
                  <input 
                    type="text" 
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="e.g., New summer collection, Coffee shop morning vibes..."
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm md:text-base"
                  />
                  <Button 
                    size="lg" 
                    onClick={generateAIContent} 
                    disabled={isGenerating || !aiInput.trim()}
                    className="gap-2 w-full sm:w-auto"
                  >
                    {isGenerating ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    ) : (
                      <Sparkles className="w-5 h-5" />
                    )}
                    Generate
                  </Button>
                </div>
              </Card>

              {generatedContent && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <Card className="p-6 md:p-8 prose prose-indigo max-w-none">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 not-prose gap-4">
                      <h4 className="text-lg font-bold text-indigo-600">AI Suggested Content</h4>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" className="flex-1 sm:flex-none" onClick={() => {
                          navigator.clipboard.writeText(generatedContent);
                          toast.success('Copied to clipboard');
                        }}>Copy All</Button>
                        <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setActiveTab('reminders')}>Schedule</Button>
                      </div>
                    </div>
                    <div className="text-sm md:text-base">
                      <Markdown>{generatedContent}</Markdown>
                    </div>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === 'reminders' && (
            <motion.div 
              key="reminders"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8"
            >
              <div className="lg:col-span-1">
                <Card className="p-6 lg:sticky lg:top-8">
                  <h3 className="font-bold text-lg mb-6">New Reminder</h3>
                  <form className="space-y-4" onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.target as any;
                    addReminder(form.title.value, form.time.value, form.content.value);
                    form.reset();
                  }}>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
                      <input name="title" required type="text" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Schedule Time</label>
                      <input name="time" required type="datetime-local" className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Post Content</label>
                      <textarea name="content" rows={4} className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none text-sm" />
                    </div>
                    <Button type="submit" className="w-full">Set Reminder</Button>
                  </form>
                </Card>
              </div>

              <div className="lg:col-span-2 space-y-4">
                {reminders.map((reminder) => (
                  <Card key={reminder.id} className={cn("p-4 md:p-6 transition-all", reminder.status === 'completed' && "opacity-60")}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex gap-3 md:gap-4">
                        <button 
                          onClick={() => toggleReminder(reminder.id, reminder.status)}
                          className={cn(
                            "mt-1 w-5 h-5 md:w-6 md:h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                            reminder.status === 'completed' ? "bg-green-500 border-green-500 text-white" : "border-gray-200 text-transparent hover:border-indigo-500"
                          )}
                        >
                          <CheckCircle className="w-3 h-3 md:w-4 md:h-4" />
                        </button>
                        <div className="min-w-0">
                          <h4 className={cn("font-bold text-base md:text-lg truncate", reminder.status === 'completed' && "line-through")}>{reminder.title}</h4>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs md:text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3 h-3 md:w-4 md:h-4" />
                              {format(new Date(reminder.scheduledTime), 'MMM d, p')}
                            </span>
                            {isAfter(new Date(), parseISO(reminder.scheduledTime)) && reminder.status === 'pending' && (
                              <span className="text-red-500 font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3 md:w-4 md:h-4" />
                                Overdue
                              </span>
                            )}
                          </div>
                          {reminder.postContent && (
                            <p className="mt-4 text-gray-600 bg-gray-50 p-3 md:p-4 rounded-xl text-xs md:text-sm border border-gray-100 italic line-clamp-4">
                              "{reminder.postContent}"
                            </p>
                          )}
                        </div>
                      </div>
                      <button onClick={() => deleteItem('reminders', reminder.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors shrink-0">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </Card>
                ))}
                {reminders.length === 0 && (
                  <div className="text-center py-12 md:py-20 bg-white rounded-2xl border border-dashed border-gray-200 text-gray-400">
                    No reminders yet. Plan your first post!
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'notes' && (
            <motion.div 
              key="notes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <button 
                  onClick={async () => {
                    if (!user) return;
                    try {
                      await addDoc(collection(db, 'notes'), {
                        uid: user.uid,
                        title: 'New Resource',
                        content: 'Start typing your business notes here...',
                        category: 'General',
                        updatedAt: new Date().toISOString()
                      });
                    } catch (error) {
                      handleFirestoreError(error, OperationType.CREATE, 'notes');
                    }
                  }}
                  className="h-64 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center text-gray-400 hover:border-indigo-500 hover:text-indigo-500 transition-all group"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-indigo-50">
                    <Plus className="w-6 h-6" />
                  </div>
                  <span className="font-medium">Add New Note</span>
                </button>

                {notes.map((note) => (
                  <Card key={note.id} className="h-64 flex flex-col group">
                    <div className="p-6 flex-1 overflow-hidden">
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                          {note.category}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => deleteItem('notes', note.id)} className="p-1 text-gray-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <h4 className="font-bold text-gray-900 mb-2 truncate">{note.title}</h4>
                      <p className="text-sm text-gray-500 line-clamp-5 leading-relaxed">
                        {note.content}
                      </p>
                    </div>
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-[10px] text-gray-400">
                        Updated {format(new Date(note.updatedAt), 'MMM d')}
                      </span>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
