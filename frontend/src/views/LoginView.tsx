import React, { useState, useEffect } from 'react';
import { Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useUIStore } from '../store/useUIStore';
import { useToastStore } from '../store/useToastStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';

export const LoginView: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [canRegister, setCanRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { setActiveNav, setCurrentUser } = useUIStore();
  const { addToast } = useToastStore();

  useEffect(() => {
    api
      .canRegister()
      .then((res) => {
        setCanRegister(res.canRegister);
        if (res.canRegister) {
          setIsRegister(true);
        }
      })
      .catch(() => {
        // Fallback to login
        setCanRegister(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password || (isRegister && !name)) {
      setError('Please fill in all required fields.');
      return;
    }

    if (!email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      if (isRegister) {
        const res = await api.register({ email, password, name });
        setCurrentUser(res.user);
        addToast({
          title: 'Account Created',
          message: `Welcome, ${res.user.name || res.user.email}!`,
          type: 'success',
        });
      } else {
        const res = await api.login({ email, password });
        setCurrentUser(res.user);
        addToast({
          title: 'Logged In',
          message: `Welcome back, ${res.user.name || res.user.email}!`,
          type: 'success',
        });
      }

      // Connect real-time socket with authenticated cookie
      const socket = getSocket();
      socket.connect();

      setActiveNav('connection');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 bg-gradient-to-b from-app to-surface-subtle overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {/* Logo and Header */}
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-control bg-accent text-white flex items-center justify-center font-bold text-2xl shadow-card mb-3">
            💬
          </div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">
            WhatsApp Client
          </h1>
          <p className="text-xs text-text-muted mt-1">
            {isRegister
              ? 'Create your master account to manage WhatsApp sessions'
              : 'Sign in to access your linked devices and sessions'}
          </p>
        </div>

        {/* Centered White Card */}
        <Card className="w-full shadow-card">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isRegister && (
                <Input
                  label="Full Name"
                  placeholder="Your Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  leftIcon={<UserIcon className="w-4 h-4" />}
                  required
                />
              )}

              <Input
                label="Email Address"
                type="email"
                placeholder="admin@local.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="w-4 h-4" />}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="w-4 h-4" />}
                required
              />

              {error && (
                <div className="p-2.5 rounded-control bg-danger-soft border border-danger/25 text-danger text-xs font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="w-4 h-4" />}
                className="w-full mt-2"
              >
                {isRegister ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            {canRegister && (
              <div className="mt-5 pt-4 border-t border-border-subtle/70 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError(null);
                  }}
                  className="text-xs text-text-secondary hover:text-accent font-medium transition-colors"
                >
                  {isRegister
                    ? 'Already have an account? Sign in'
                    : 'First time setup? Create account'}
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Security badge note */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <span>AES-256-GCM encrypted database credentials & Argon2 hashing</span>
        </div>
      </div>
    </div>
  );
};
