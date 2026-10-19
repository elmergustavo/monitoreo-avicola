import { BellRing, ChartSpline, ClipboardList, MessageSquareShare, Cpu, FileText, Gauge, LogOut, ShieldCheck, User, Users, Warehouse, type LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { BrandMark } from '@/components/brand-mark';
import { LiveIndicator } from '@/components/live-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { NotificationCenter } from '@/features/alerts/notification-center';
import { useActiveAlerts } from '@/features/alerts/queries';
import { useAuth } from '@/features/auth/auth-context';
import { LiveProvider } from '@/features/monitoring/live-provider';
import { useDevices } from '@/features/monitoring/queries';
import { initials } from '@/lib/initials';
import type { Permission } from '@/lib/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  end?: boolean;
}

const ADMIN_NAV: NavItem[] = [
  { to: '/administracion/galpones', label: 'Dispositivos', icon: Cpu, permission: 'devices.manage' },
  { to: '/administracion/usuarios', label: 'Usuarios', icon: Users, permission: 'users.read' },
  { to: '/administracion/roles', label: 'Roles y permisos', icon: ShieldCheck, permission: 'roles.manage' },
  { to: '/administracion/notificaciones', label: 'Notificaciones', icon: MessageSquareShare, permission: 'alerts.manage' },
  { to: '/administracion/bitacora', label: 'Bitácora', icon: ClipboardList, permission: 'audit.read' },
];

export function AppShell() {
  const { can } = useAuth();
  return (
    <LiveProvider enabled={can('telemetry.read')}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-background">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur-sm sm:px-5">
            <SidebarTrigger className="size-10" aria-label="Abrir o cerrar menú" />
            <div className="ml-auto flex items-center gap-1 sm:gap-3">
              {can('telemetry.read') && <LiveIndicator />}
              <NotificationCenter />
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main className="mx-auto w-full max-w-7xl min-w-0 px-4 pt-6 pb-14 sm:px-6 sm:pt-8">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </LiveProvider>
  );
}

function AppSidebar() {
  const { can } = useAuth();
  const { setOpenMobile } = useSidebar();
  const location = useLocation();
  const devices = useDevices();
  const activeAlerts = useActiveAlerts(can('telemetry.read'));
  const pendingAlerts = activeAlerts.data?.filter((a) => a.status === 'open').length ?? 0;

  // Close the mobile drawer after navigating.
  useEffect(() => setOpenMobile(false), [location.pathname, setOpenMobile]);

  const adminItems = ADMIN_NAV.filter((item) => !item.permission || can(item.permission));

  return (
    <Sidebar>
      <SidebarHeader className="h-14 justify-center border-b px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <BrandMark className="size-7 text-primary" />
          <span className="leading-tight">
            <span className="block font-display text-base font-semibold tracking-tight">La Sierra</span>
            <span className="block text-[11px] text-muted-foreground">Monitoreo de galpones</span>
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {(can('telemetry.read') || can('reports.export')) && (
          <SidebarGroup>
            <SidebarGroupLabel>Monitoreo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {can('telemetry.read') && (
                  <>
                    <NavMenuItem item={{ to: '/', label: 'Resumen', icon: Gauge, end: true }} />
                    {devices.data
                      ?.filter((d) => d.active)
                      .map((device) => (
                        <NavMenuItem
                          key={device.id}
                          item={{ to: `/galpones/${device.id}`, label: device.name, icon: Warehouse }}
                          online={device.online}
                        />
                      ))}
                    <NavMenuItem item={{ to: '/analisis', label: 'Análisis', icon: ChartSpline }} />
                    <NavMenuItem item={{ to: '/alertas', label: 'Alertas', icon: BellRing }} count={pendingAlerts} />
                  </>
                )}
                {can('reports.export') && <NavMenuItem item={{ to: '/reportes', label: 'Reportes', icon: FileText }} />}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Administración</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <NavMenuItem key={item.to} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <NavMenuItem item={{ to: '/perfil', label: 'Mi perfil', icon: User }} />
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function NavMenuItem({ item, online, count }: { item: NavItem; online?: boolean; count?: number }) {
  const location = useLocation();
  const active = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} className="h-10">
        <NavLink to={item.to} end={item.end}>
          <Icon aria-hidden="true" />
          <span className="truncate">{item.label}</span>
          {online !== undefined && (
            <span
              className={`ml-auto size-2 shrink-0 rounded-full ${online ? 'bg-optimal' : 'bg-muted-foreground/40'}`}
              aria-label={online ? 'En línea' : 'Desconectado'}
            />
          )}
          {count !== undefined && count > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1.5 text-[11px] font-semibold text-white tabular">
              {count > 9 ? '9+' : count}
              <span className="sr-only"> sin atender</span>
            </span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Menú de usuario">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.role.name}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/perfil">
            <User aria-hidden="true" /> Mi perfil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut aria-hidden="true" /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
