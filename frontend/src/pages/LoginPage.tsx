import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useLogin } from '../hooks/useAuth';
import type { LoginRequest } from '../types';

export default function LoginPage() {
  const navigate = useNavigate();
  const login    = useLogin();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginRequest>();

  useEffect(() => {
    if (localStorage.getItem('gpflow_access_token')) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const onSubmit = handleSubmit((data) =>
    login.mutate(data, { onSuccess: () => navigate('/dashboard', { replace: true }) })
  );

  const errorMsg = login.error
    ? (login.error as any)?.response?.data?.detail ?? 'Invalid email or password'
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0,212,160,0.06) 0%, transparent 70%)' }}
      />
      <div className="w-full max-w-sm relative">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-accent">
            <span className="text-black font-black text-sm">GP</span>
          </div>
          <span className="font-bold text-2xl tracking-tight text-text">GPFLOW</span>
        </div>
        <div className="card p-7 shadow-card">
          <h1 className="text-xl font-bold text-text mb-1">Welcome back</h1>
          <p className="text-sm text-sub mb-6">Sign in to your operator account</p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-sub mb-1.5 font-medium">Email</label>
              <input {...register('email', { required: 'Email required' })} type="email" placeholder="you@example.com" autoComplete="email" className="input-field" />
              {errors.email && <p className="text-xs text-red mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-xs text-sub mb-1.5 font-medium">Password</label>
              <input {...register('password', { required: 'Password required' })} type="password" placeholder="••••••••" autoComplete="current-password" className="input-field" />
              {errors.password && <p className="text-xs text-red mt-1">{errors.password.message}</p>}
            </div>
            {errorMsg && (
              <div className="bg-red/10 border border-red/30 rounded-lg px-3 py-2">
                <p className="text-xs text-red">{errorMsg}</p>
              </div>
            )}
            <button type="submit" disabled={login.isPending} className="btn-accent w-full justify-center py-2.5 mt-2">
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-sub mt-5">
          New operator?{' '}
          <Link to="/register" className="text-accent hover:underline font-medium">Create account</Link>
        </p>
      </div>
    </div>
  );
}
