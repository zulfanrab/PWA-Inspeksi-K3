import type { ReactNode } from 'react';

interface DesktopLayoutProps {
  sidebar: ReactNode;
  mainContent: ReactNode;
  header?: ReactNode;
  alerts?: ReactNode;
  userBar?: ReactNode;
  bottomNav?: ReactNode;
  darkMode: boolean;
  isOnline: boolean;
}

export function DesktopLayout({
  sidebar,
  mainContent,
  header,
  alerts,
  userBar,
  bottomNav,
  darkMode,
  isOnline
}: DesktopLayoutProps) {
  const colors = darkMode ? {
    bg: '#0F172A',
    sidebarBg: '#1E293B',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    border: '#334155',
    cardBg: '#1E293B',
    headerBg: 'rgba(15,23,42,0.97)',
    onlineBadge: '#ECFDF5',
    offlineBadge: '#FEF2F2'
  } : {
    bg: '#F8FAFC',
    sidebarBg: '#FFFFFF',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    border: '#E2E8F0',
    cardBg: '#FFFFFF',
    headerBg: 'rgba(255,255,255,0.97)',
    onlineBadge: '#ECFDF5',
    offlineBadge: '#FEF2F2'
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'row',
      background: colors.bg,
      color: colors.textPrimary,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Desktop Sidebar */}
      <aside style={{
        width: 280,
        flexShrink: 0,
        background: colors.sidebarBg,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto'
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '20px 16px 16px',
          borderBottom: `1px solid ${colors.border}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16
          }}>
            <img 
              src="/icons/icon-192.png" 
              alt="ARP" 
              style={{ 
                width: 40, 
                height: 40, 
                borderRadius: 10, 
                objectFit: 'cover',
                border: `1px solid ${colors.border}`
              }} 
            />
            <div>
              <h1 style={{
                fontSize: 16,
                fontWeight: 700,
                color: colors.textPrimary,
                letterSpacing: '-0.3px'
              }}>
                Aksara <span style={{ color: '#10B981' }}>Inspect</span>
              </h1>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 2
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isOnline ? '#10B981' : '#EF4444'
                }} />
                <span style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: isOnline ? '#065F46' : '#B91C1C'
                }}>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Content */}
        <div style={{ flex: 1, padding: '16px 0' }}>
          {sidebar}
        </div>

        {/* Sidebar Footer */}
        <div style={{
          padding: '16px',
          borderTop: `1px solid ${colors.border}`,
          marginTop: 'auto'
        }}>
          <div style={{
            fontSize: 11,
            color: colors.textSecondary,
            textAlign: 'center'
          }}>
            PWA Inspeksi K3 v1.0
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0
      }}>
        {/* Top Header */}
        <header style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: colors.headerBg,
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${colors.border}`,
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {header}
        </header>

        {/* Alerts and User Bar */}
        <div style={{ padding: '16px 24px 0' }}>
          {alerts && <div style={{ marginBottom: 12 }}>{alerts}</div>}
          {userBar && <div style={{ marginBottom: 16 }}>{userBar}</div>}
        </div>

        {/* Main Content */}
        <main style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto'
        }}>
          <div style={{
            maxWidth: 900,
            margin: '0 auto',
            width: '100%'
          }}>
            {mainContent}
          </div>
        </main>

        {/* Bottom Nav (Mobile Only) */}
        {bottomNav && (
          <div style={{ display: 'none' }}>
            {bottomNav}
          </div>
        )}
      </div>
    </div>
  );
}

export function DesktopStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      transition: 'all 0.2s',
      cursor: 'pointer'
    }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: '#64748B', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ 
        fontSize: 24, 
        fontWeight: 700, 
        color: color,
        letterSpacing: '-0.5px'
      }}>
        {value}
      </div>
    </div>
  );
}

export function DesktopObjCard({ 
  icon, 
  label, 
  description, 
  onClick 
}: { 
  icon: ReactNode; 
  label: string; 
  description: string; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.2s',
        width: '100%'
      }}
    >
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: '#F0FDFA',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#10B981',
        flexShrink: 0
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
          {description}
        </div>
      </div>
    </button>
  );
}