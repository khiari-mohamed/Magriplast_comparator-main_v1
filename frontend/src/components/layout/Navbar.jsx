import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ChevronDown, FileText, LogOut, ScanText, Upload } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

const C = {
  primary: "#1e3a5f",
  accent: "#3e1f6d",
  border: "#e0e7ef",
  muted: "#546e7a",
};

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav
      style={{
        background: "white",
        borderBottom: `1px solid ${C.border}`,
        height: 64,
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 8px rgba(30,58,95,0.06)",
      }}
    >
      <style>{`
        @media (max-width: 720px) {
          .navbar-user-text { display: none; }
          .navbar-upload-label { display: none; }
        }
      `}</style>

      <Link
        to="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${C.primary} 0%, ${C.accent} 100%)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ScanText size={17} color="white" strokeWidth={2.1} />
        </div>
        <span
          style={{
            color: C.primary,
            fontSize: "1rem",
            fontWeight: 800,
            letterSpacing: "-0.3px",
            whiteSpace: "nowrap",
          }}
        >
          Magriplast
        </span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
        <NavLink
          to="/"
          end
          style={({ isActive }) => ({
            height: 40,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            borderRadius: 10,
            border: `1px solid ${isActive ? "rgba(30,58,95,0.16)" : C.border}`,
            background: isActive ? "#f0f5fb" : "white",
            color: isActive ? C.primary : C.muted,
            fontSize: "0.84rem",
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: isActive ? "inset 0 1px 0 rgba(255,255,255,0.7)" : "none",
          })}
        >
          <Upload size={16} strokeWidth={2.2} />
          <span className="navbar-upload-label">Upload</span>
        </NavLink>

        {user && (
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              style={{
                height: 42,
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "white",
                border: `1px solid ${C.border}`,
                borderRadius: 11,
                padding: "5px 10px 5px 5px",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 31,
                  height: 31,
                  borderRadius: 9,
                  background: `linear-gradient(135deg, ${C.primary} 0%, ${C.accent} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "0.72rem",
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div className="navbar-user-text" style={{ textAlign: "left", maxWidth: 220 }}>
                <p
                  style={{
                    color: C.primary,
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.full_name}
                </p>
                <p
                  style={{
                    color: C.muted,
                    fontSize: "0.7rem",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.email}
                </p>
              </div>
              <ChevronDown
                size={14}
                color={C.muted}
                strokeWidth={2.5}
                style={{
                  transform: open ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s",
                }}
              />
            </button>

            {open && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: 240,
                  background: "white",
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  boxShadow: "0 8px 32px rgba(30,58,95,0.12)",
                  overflow: "hidden",
                  zIndex: 200,
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    borderBottom: `1px solid ${C.border}`,
                    background: "#f8faff",
                  }}
                >
                  <p style={{ color: C.primary, fontSize: "0.82rem", fontWeight: 700 }}>
                    {user.full_name}
                  </p>
                  <p style={{ color: C.muted, fontSize: "0.75rem", wordBreak: "break-all" }}>
                    {user.email}
                  </p>
                </div>
                <Link
                  to="/"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: C.primary,
                    fontSize: "0.84rem",
                    fontWeight: 600,
                    textDecoration: "none",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <FileText size={15} strokeWidth={2.2} />
                  Upload document
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    background: "white",
                    border: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    color: "#b71c1c",
                    fontSize: "0.84rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <LogOut size={15} strokeWidth={2.2} />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
