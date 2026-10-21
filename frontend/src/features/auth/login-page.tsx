import { BellRing, Droplets, Eye, EyeOff, Loader2, Thermometer } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { BrandMark } from '@/components/brand-mark';
import { FormField } from '@/components/form-field';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useAuth } from './auth-context';

const FEATURES = [
  { icon: Thermometer, label: 'Temperatura en vivo' },
  { icon: Droplets, label: 'Supervisión del riego' },
  { icon: BellRing, label: 'Alertas al celular' },
];

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(user.mustChangePassword ? '/cambiar-contrasena' : (from ?? '/'), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.');
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side (desktop) */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-3">
          <BrandMark className="size-9" />
          <span className="font-display text-xl font-semibold tracking-tight">La Sierra</span>
        </div>
        <div className="relative max-w-xl">
          <p className="font-display text-4xl leading-tight font-semibold tracking-tight text-balance">
            Sistema de monitoreo y control automatizado de variables climáticas
          </p>
          <p className="mt-4 text-lg text-primary-foreground/80 text-pretty">
            Para la optimización del bienestar animal y la eficiencia productiva en Granjas Avícolas La Sierra.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Funciones del sistema">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-sm text-primary-foreground/90"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-24 size-[28rem] text-primary-foreground/[0.06]"
          viewBox="0 0 32 32"
          fill="currentColor"
        >
          <path d="M4 14.5 16 5l12 9.5V27H4V14.5Z" />
        </svg>
        <p className="text-xs text-primary-foreground/60">Horas en tiempo de Guatemala</p>
      </aside>

      {/* Form side */}
      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2.5 lg:hidden">
            <BrandMark className="size-8 text-primary" />
            <span className="font-display text-lg font-semibold tracking-tight">La Sierra</span>
          </div>
          <ThemeToggle />
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Iniciar sesión</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ingresa con el correo que te dio el administrador.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
            <FormField id="email" label="Correo electrónico">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </FormField>

            <FormField id="password" label="Contraseña" error={error}>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'password-error' : undefined}
                  className="h-11 pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-0.5 size-10 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </FormField>

            <Button type="submit" className="h-11 w-full" disabled={submitting || !email || !password}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {submitting ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>

          <p className="mt-6 text-xs text-muted-foreground">
            ¿Olvidaste tu contraseña? Pide a un administrador que la restablezca.
          </p>
        </div>
      </main>
    </div>
  );
}
