import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useUIStore } from '../store/useUIStore';
import { useToastStore } from '../store/useToastStore';

export const LoginView: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { setActiveNav } = useUIStore();
  const { addToast } = useToastStore();

  const handleSubmit = (e: React.FormEvent) => {
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

    setTimeout(() => {
      setIsLoading(false);
      addToast({
        title: isRegister ? 'Account Created' : 'Logged In',
        message: `Welcome back, ${name || email}!`,
        type: 'success',
      });
      setActiveNav('chats');
    }, 800);
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
              ? 'Create an account to manage your WhatsApp sessions'
              : 'Sign in to access your linked devices and chats'}
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
                  leftIcon={<User className="w-4 h-4" />}
                  required
                />
              )}

              <Input
                label="Email Address"
                type="email"
                placeholder="you@domain.com"
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
                  : "Don't have an account? Create one"}
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Security badge note */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <span>Multi-account ready schema with isolated session storage</span>
        </div>
      </div>
    </div>
  );
};
