import { useRef, useState } from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import { triggerRefresh } from "./api";
import FilterBar from "./components/FilterBar";
import AlertsPage from "./pages/Alerts";
import EventScreen from "./pages/EventScreen";
import GrowthScreen from "./pages/GrowthScreen";
import ObserverPage from "./pages/Observer";
import Overview from "./pages/Overview";
import TickerDetail from "./pages/TickerDetail";
import ValueScreen from "./pages/ValueScreen";

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: "/", label: "Overview", end: true },
  { to: "/value", label: "Nivel 1 · Value" },
  { to: "/growth", label: "Nivel 2 · Growth" },
  { to: "/event", label: "Nivel 3 · Event" },
  { to: "/alerts", label: "Alertas" },
  { to: "/observer", label: "Observer" },
];

function RefreshButton() {
  const [label, setLabel] = useState("Actualizar datos");
  const busy = useRef(false);

  const onClick = async () => {
    if (busy.current) return;
    busy.current = true;
    setLabel("Actualizando…");
    try {
      await triggerRefresh("prices_latest");
      window.location.reload();
    } catch {
      setLabel("Error al actualizar");
      setTimeout(() => {
        setLabel("Actualizar datos");
        busy.current = false;
      }, 3000);
    }
  };

  return (
    <button type="button" className="btn-refresh" onClick={onClick}>
      {label}
    </button>
  );
}

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <Link to="/" className="logo">
            <span className="logo-mark" aria-hidden="true">
              ◮
            </span>
            Market Sentinel
          </Link>
          <FilterBar />
          <RefreshButton />
        </div>
        <nav className="tabs" aria-label="Secciones">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) => `tab${isActive ? " tab-active" : ""}`}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/value" element={<ValueScreen />} />
          <Route path="/growth" element={<GrowthScreen />} />
          <Route path="/event" element={<EventScreen />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/observer" element={<ObserverPage />} />
          <Route path="/ticker/:symbol" element={<TickerDetail />} />
        </Routes>
      </main>
    </div>
  );
}
