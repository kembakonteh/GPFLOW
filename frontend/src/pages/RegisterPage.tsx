import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useRegister } from '../hooks/useAuth';
import type { RegisterRequest, WeightUnit } from '../types';

const COUNTRIES = [
  { code: 'US', name: '🇺🇸 United States' },
  { code: 'GB', name: '🇬🇧 United Kingdom' },
  { code: 'CA', name: '🇨🇦 Canada' },
  { code: 'DE', name: '🇩🇪 Germany' },
  { code: 'SE', name: '🇸🇪 Sweden' },
  { code: 'FR', name: '🇫🇷 France' },
  { code: 'NL', name: '🇳🇱 Netherlands' },
  { code: 'BE', name: '🇧🇪 Belgium' },
  { code: 'NO', name: '🇳🇴 Norway' },
  { code: 'IT', name: '🇮🇹 Italy' },
  { code: 'ES', name: '🇪🇸 Spain' },
  { code: 'GM', name: '🇬🇲 The Gambia' },
];

type Step1 = Pick<RegisterRequest, 'name' | 'business_name' | 'email' | 'phone' | 'password'>;
type Step2 = Pick<RegisterRequest, 'country' | 'city'> & { weight_unit: WeightUnit };

export default function RegisterPage() {
  const [step, setStep] = useState(1);
  const [step1Data, setStep1Data] = useState<Step1 | null>(null);
  const navigate  = useNavigate();
  const register_ = useRegister();

  const {
    register, handleSubmit, watch,
    formState: { errors },
    trigger,
  } = useForm<Step1 & Step2>({
    defaultValues: { weight_unit: 'kg' },
  });

  const weightUnit = watch('weight_unit');

  async function handleStep1() {
    const valid = await trigger(['name', 'business_name', 'email', 'phone', 'password']);
    if (!valid) return;
    setStep1Data({
      name:          watch('name'),
      business_name: watch('business_name'),
      email:         watch('email'),
      phone:         watch('phone'),
      password:      watch('password'),
    });
    setStep(2);
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!step1Data) return;
    const payload: RegisterRequest = {
      ...step1Data,
      country:     values.country,
      city:        values.city,
      weight_unit: values.weight_unit,
    };
    register_.mutate(payload, {
      onSuccess: () => navigate('/onboarding', { replace: true }),
    });
  });

  const errMsg = register_.error
    ? (register_.error as any)?.response?.data?.detail ?? 'Registration failed'
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4 py-10">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0,212,160,0.06) 0%, transparent 70%)' }}
      />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shadow-accent">
            <span className="text-black font-black text-sm">GP</span>
          </div>
          <span className="font-bold text-2xl tracking-tight text-text">GPFLOW</span>
        </div>

        <div className="card p-7 shadow-card">
          {/* Step indicator */}
          <div className="flex gap-1 mb-6">
            <div className="h-1 flex-1 rounded-full bg-accent" />
            <div className={`h-1 flex-1 rounded-full transition-colors ${step === 2 ? 'bg-accent' : 'bg-line'}`} />
          </div>

          <h1 className="text-xl font-bold text-text mb-1">
            {step === 1 ? 'Create your account' : 'Almost there'}
          </h1>
          <p className="text-sm text-sub mb-6">
            {step === 1 ? 'Step 1 of 2 — Your details' : 'Step 2 of 2 — Location & preferences'}
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* ── Step 1 ── */}
            {step === 1 && (
              <>
                <div>
                  <label className="block text-xs text-sub mb-1.5 font-medium">Full name</label>
                  <input
                    {...register('name', { required: 'Name is required' })}
                    placeholder="Amadou Jallow"
                    className="input-field"
                  />
                  {errors.name && <p className="text-xs text-red mt-1">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="block text-xs text-sub mb-1.5 font-medium">Business name</label>
                  <input
                    {...register('business_name', { required: 'Business name is required' })}
                    placeholder="Amadou GP Transport"
                    className="input-field"
                  />
                  {errors.business_name && <p className="text-xs text-red mt-1">{errors.business_name.message}</p>}
                </div>

                <div>
                  <label className="block text-xs text-sub mb-1.5 font-medium">Email</label>
                  <input
                    {...register('email', { required: 'Email is required' })}
                    type="email"
                    placeholder="you@example.com"
                    className="input-field"
                  />
                  {errors.email && <p className="text-xs text-red mt-1">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-xs text-sub mb-1.5 font-medium">Phone (with country code)</label>
                  <input
                    {...register('phone', { required: 'Phone is required' })}
                    placeholder="+1 206 555 0142"
                    className="input-field"
                  />
                  {errors.phone && <p className="text-xs text-red mt-1">{errors.phone.message}</p>}
                </div>

                <div>
                  <label className="block text-xs text-sub mb-1.5 font-medium">Password</label>
                  <input
                    {...register('password', {
                      required: 'Password is required',
                      minLength: { value: 8, message: 'Minimum 8 characters' },
                    })}
                    type="password"
                    placeholder="Minimum 8 characters"
                    className="input-field"
                  />
                  {errors.password && <p className="text-xs text-red mt-1">{errors.password.message}</p>}
                </div>

                <button
                  type="button"
                  onClick={handleStep1}
                  className="btn-accent w-full justify-center py-2.5 mt-2"
                >
                  Continue →
                </button>
              </>
            )}

            {/* ── Step 2 ── */}
            {step === 2 && (
              <>
                <div>
                  <label className="block text-xs text-sub mb-1.5 font-medium">Country</label>
                  <select
                    {...register('country', { required: 'Country is required' })}
                    className="input-field"
                  >
                    <option value="">Select country…</option>
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                  {errors.country && <p className="text-xs text-red mt-1">{errors.country.message}</p>}
                </div>

                <div>
                  <label className="block text-xs text-sub mb-1.5 font-medium">City</label>
                  <input
                    {...register('city', { required: 'City is required' })}
                    placeholder="e.g. New York"
                    className="input-field"
                  />
                  {errors.city && <p className="text-xs text-red mt-1">{errors.city.message}</p>}
                </div>

                <div>
                  <label className="block text-xs text-sub mb-2 font-medium">Preferred weight unit</label>
                  <div className="flex gap-2">
                    {(['kg', 'lbs'] as WeightUnit[]).map((unit) => (
                      <label
                        key={unit}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer text-sm font-medium transition-all ${
                          weightUnit === unit
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-line bg-card2 text-sub hover:text-text'
                        }`}
                      >
                        <input
                          type="radio"
                          value={unit}
                          {...register('weight_unit')}
                          className="sr-only"
                        />
                        {unit === 'kg' ? '⚖️' : '🏋️'} {unit}
                      </label>
                    ))}
                  </div>
                </div>

                {errMsg && (
                  <div className="bg-red/10 border border-red/30 rounded-lg px-3 py-2">
                    <p className="text-xs text-red">{errMsg}</p>
                  </div>
                )}

                <div className="flex gap-3 mt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="btn-ghost flex-1 justify-center"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={register_.isPending}
                    className="btn-accent flex-1 justify-center py-2.5"
                  >
                    {register_.isPending ? 'Creating…' : 'Create account'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-sub mt-5">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
