import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Client } from '../types';

/** Cores iguais às do CRM de referência (crmMapStatusColor, index.js:5239). */
function statusColor(status: string) {
  switch (status) {
    case 'Ativo':
      return 'var(--c-muted)';
    case 'Contactado':
      return 'var(--c-muted)';
    case 'Inativo':
      return 'var(--c-muted)';
    default:
      return 'var(--c-danger)'; // Prospeto
  }
}

type Filter = 'todos' | 'Ativo' | 'Prospeto' | 'Contactado';

/** Distância em km entre dois pontos (haversine). */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371,
    toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat),
    dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

/** Pin circular desenhado em CSS, para não depender de imagens externas. */
function pinIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};
           border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function MapaPage({
  clients,
  onOpenClient,
}: {
  clients: Client[];
  onOpenClient?: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('todos');
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [locStatus, setLocStatus] = useState('A procurar GPS...');
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const withGps = useMemo(
    () => clients.filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))),
    [clients],
  );
  const shown = useMemo(
    () => (filter === 'todos' ? withGps : withGps.filter((c) => c.status === filter)),
    [withGps, filter],
  );

  // Cria o mapa uma única vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([39.5, -8.0], 7); // Portugal continental
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // O contentor só tem altura definitiva depois do primeiro paint
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Redesenha os pins quando muda o filtro ou os clientes
  useEffect(() => {
    const layer = layerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    shown.forEach((c) => {
      const marker = L.marker([Number(c.lat), Number(c.lng)], {
        icon: pinIcon(statusColor(c.status)),
      });
      marker.bindPopup(`
        <div class="crm-map-popup-name">${c.name}</div>
        <div class="crm-map-popup-sub">${[c.city, c.sector].filter(Boolean).join(' · ')}</div>
        <div class="crm-map-popup-sub">${c.status} · score ${c.score}</div>
        ${c.phone ? `<div class="crm-map-popup-sub">${c.phone}</div>` : ''}
      `);
      layer.addLayer(marker);
    });

    if (shown.length > 0) {
      const bounds = L.latLngBounds(
        shown.map((c) => [Number(c.lat), Number(c.lng)] as [number, number]),
      );
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [shown]);

  // Modo terreno: segue a posição em contínuo (watchPosition), para a lista
  // "à tua volta" acompanhar o comercial enquanto ele se desloca.
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocStatus('GPS não disponível');
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(p);
        setLocStatus(
          `GPS ativo${pos.coords.accuracy ? ` (${Math.round(pos.coords.accuracy)} m)` : ''}`,
        );
        const map = mapRef.current;
        if (!map) return;
        if (userMarkerRef.current) userMarkerRef.current.setLatLng(p);
        else {
          userMarkerRef.current = L.marker(p, { icon: pinIcon('var(--c-accent)') })
            .bindPopup('<div class="crm-map-popup-name">Estás aqui</div>')
            .addTo(map);
        }
      },
      () => setLocStatus('Sem acesso ao GPS'),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /** Os 8 clientes mais próximos da posição atual, ordenados por distância. */
  const nearby = useMemo(() => {
    if (!userPos) return [];
    const me = { lat: userPos[0], lng: userPos[1] };
    return shown
      .map((c) => ({ c, d: distanceKm(me, { lat: Number(c.lat), lng: Number(c.lng) }) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 8);
  }, [userPos, shown]);

  function centerOnUser() {
    if (userPos && mapRef.current) mapRef.current.setView(userPos, 13);
  }

  const counts = {
    total: withGps.length,
    ativos: withGps.filter((c) => c.status === 'Ativo').length,
    prospetos: withGps.filter((c) => c.status === 'Prospeto').length,
  };

  return (
    <div className="crm-page">
      <div className="crm-page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1>Mapa</h1>
          <p>Distribuição geográfica da carteira</p>
        </div>
      </div>

      <div className="crm-mapa-toolbar">
        <div className="crm-mapa-stats">
          <span className="crm-mapa-stat">
            <span className="crm-mapa-dot" style={{ background: 'var(--c-accent)' }} />
            {counts.total} com GPS
          </span>
          <span className="crm-mapa-stat">
            <span className="crm-mapa-dot" style={{ background: 'var(--c-muted)' }} />
            {counts.ativos} ativos
          </span>
          <span className="crm-mapa-stat">
            <span className="crm-mapa-dot" style={{ background: 'var(--c-danger)' }} />
            {counts.prospetos} prospetos
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'var(--c-muted)' }}>{locStatus}</span>
          <button className="crm-cal-btn" onClick={centerOnUser} disabled={!userPos}>
            Centrar onde estou
          </button>
          {(['todos', 'Ativo', 'Prospeto', 'Contactado'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`crm-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'todos' ? 'Todos' : f + 's'}
            </button>
          ))}
        </div>
      </div>

      <div className="crm-mapa-layout">
        <div ref={containerRef} className="crm-mapa-canvas" />

        {/* Modo terreno — o que está à minha volta agora */}
        <aside className="crm-nearby">
          <div className="crm-nearby-head">
            <span className="crm-record-coltitle" style={{ margin: 0 }}>
              À tua volta
            </span>
            <strong className="crm-nearby-count">{nearby.length}</strong>
          </div>

          {!userPos && (
            <div className="crm-nearby-empty">
              Ativa a localização para ordenar os clientes por proximidade.
            </div>
          )}

          {userPos && nearby.length === 0 && (
            <div className="crm-nearby-empty">Nenhum cliente com GPS neste filtro.</div>
          )}

          {nearby.map(({ c, d }) => (
            <div key={c.id} className="crm-nearby-item">
              <div className="crm-nearby-dist">{formatDistance(d)}</div>
              <div className="crm-nearby-body">
                <div className="crm-nearby-name">{c.name}</div>
                <div className="crm-nearby-meta">
                  {[c.city, c.status].filter(Boolean).join(' · ')}
                </div>
                <div className="crm-nearby-actions">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="crm-nearby-act"
                  >
                    Ir
                  </a>
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="crm-nearby-act">
                      Ligar
                    </a>
                  )}
                  <button className="crm-nearby-act" onClick={() => onOpenClient?.(c.id)}>
                    Abrir
                  </button>
                </div>
              </div>
            </div>
          ))}
        </aside>
      </div>

      {withGps.length === 0 && (
        <div className="crm-empty">
          Nenhum cliente com coordenadas. Preenche a localização GPS na ficha do cliente.
        </div>
      )}
    </div>
  );
}
