import { useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { Calendar, LogIn, UserPlus, Eye, EyeOff, Mail } from 'lucide-react';

export function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'reset') {
      const result = await resetPassword(email);
      if (result.error) {
        setError(result.error);
      } else {
        setResetSuccess(true);
      }
      setLoading(false);
      return;
    }

    if (mode === 'signin') {
      const result = await signIn(email, password);
      if (result.error) setError(result.error);
    } else {
      if (!name.trim()) {
        setError('Name is required');
        setLoading(false);
        return;
      }
      const result = await signUp(email, password, name.trim());
      if (result.error) {
        setError(result.error);
      } else {
        setSignupSuccess(true);
      }
    }
    setLoading(false);
  };

  if (resetSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500 mb-6">
            We sent a password reset link to <strong>{email}</strong>. Click it to reset your password.
          </p>
          <button
            onClick={() => { setResetSuccess(false); setMode('signin'); setError(''); }}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="w-6 h-6 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
          <p className="text-sm text-gray-500 mb-6">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </p>
          <button
            onClick={() => { setSignupSuccess(false); setMode('signin'); }}
            className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Calendar className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-gray-900 text-xl">Shifts</span>
        </div>

        <h2 className="text-lg font-semibold text-gray-900 text-center mb-1">
          {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
        </h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          {mode === 'signin' ? 'Sign in to manage your shifts' : mode === 'signup' ? 'Sign up to get started' : 'Enter your email to receive a reset link'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              required
            />
          </div>

          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full px-3 py-2.5 pr-10 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <span>Loading...</span>
            ) : mode === 'signin' ? (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            ) : mode === 'signup' ? (
              <>
                <UserPlus className="w-4 h-4" />
                Sign Up
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                Send Reset Link
              </>
            )}
          </button>
        </form>

        {mode === 'signin' && (
          <div className="mt-3 text-center">
            <button
              onClick={() => { setMode('reset'); setError(''); }}
              className="text-sm text-gray-400 hover:text-indigo-600 transition-colors"
            >
              Forgot your password?
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          {mode === 'signin' ? (
            <p className="text-sm text-gray-500">
              Don't have an account?{' '}
              <button onClick={() => { setMode('signup'); setError(''); }} className="text-indigo-600 hover:text-indigo-700 font-medium">
                Sign Up
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              {mode === 'reset' ? 'Remember your password?' : 'Already have an account?'}{' '}
              <button onClick={() => { setMode('signin'); setError(''); }} className="text-indigo-600 hover:text-indigo-700 font-medium">
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
