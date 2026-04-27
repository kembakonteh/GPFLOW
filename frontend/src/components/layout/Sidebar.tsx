import { NavLink, useNavigate } from 'react-router-dom';
import { useLogout } from '../../hooks/useAuth';
import { useMe } from '../../hooks/useAuth';
import type { OperatorTier } from '../../types';

interface NavItemProps {
  to:    string;
  icon:  string;
  label: string;
}

const TIER_BADGE: Record<OperatorTier, string> = {
  starter: 'text-sub bg-card2',
  regular: 'text-blue bg-blue/10',
  pro:     'text-gold bg-gold/10',
};

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
          isActive
            ? 'bg-accent/10 text-accent'
            : 'text-sub hover:text-text hover:bg-card2'
        }`
      }
    >
      <span className="text-base w-5 text-center">{icon}</span>
      {label}
    </NavLink>
  );
}

interface SidebarProps {
  onNewTrip: () => void;
}

export default function Sidebar({ onNewTrip }: SidebarProps) {
  const { data: me } = useMe();
  const logout       = useLogout();
  const navigate     = useNavigate();

  const tierCls = TIER_BADGE[me?.tier ?? 'starter'];

  return (
    <aside
      className="flex flex-col w-[220px] flex-shrink-0 border-r border-line bg-card"
      style={{ minHeight: '100vh' }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
            <span className="text-black font-black text-xs">GP</span>
          </div>
          <span className="font-bold text-text text-base tracking-tight">GPFLOW</span>
        </div>
      </div>

      {/* Operator info */}
      {me && (
        <div className="px-4 py-4 border-b border-line">
          <p className="text-sm font-semibold text-text truncate">{me.business_name}</p>
          <p className="text-xs text-sub truncate">{me.name}</p>
          <div className="mt-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full uppercase tracking-wide ${tierCls}`}>
              {me.tier}
            </span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        <NavItem to="/dashboard"   icon="📊" label="Dashboard"  />
        <NavItem to="/trips"       icon="✈️"  label="Trips"      />
        <NavItem to="/bookings"    icon="📦" label="Bookings"   />
        <NavItem to="/contacts"    icon="👥" label="Contacts"   />
        <NavItem to="/analytics"   icon="📈" label="Analytics"  />
      </nav>

      {/* New Trip CTA */}
      <div className="px-3 pb-3">
        <button
          onClick={onNewTrip}
          className="btn-accent w-full justify-center py-2.5"
        >
          <span className="text-base">＋</span>
          New Trip
        </button>
      </div>

      {/* Footer */}
      <div className="px-3 pb-5 border-t border-line pt-3 flex flex-col gap-1">
        <button
          onClick={() => navigate('/settings')}
          className="btn-ghost w-full justify-start text-xs"
        >
          ⚙️ Settings
        </button>
        <button
          onClick={() => logout.mutate()}
          className="btn-ghost w-full justify-start text-xs text-red hover:text-red"
        >
          ↩ Sign out
        </button>
      </div>
    </aside>
  );
}
