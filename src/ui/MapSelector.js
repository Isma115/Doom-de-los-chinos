// Selector inicial de misión, extraído de main.js.
// Recibe onSelect(mapId) para no importar Game (evita ciclo).
import { AVAILABLE_MAPS } from '../Constants.js';

export function createMapSelector(onSelect) {
    const selectorDiv = document.createElement('div');
    selectorDiv.id = 'map-selector';

    const title = document.createElement('div');
    title.className = 'map-title';
    title.innerText = 'SELECCIONAR MISIÓN';
    selectorDiv.appendChild(title);

    const listDiv = document.createElement('div');
    listDiv.className = 'map-list';

    AVAILABLE_MAPS.forEach(map => {
        const btn = document.createElement('button');
        btn.className = 'map-btn';
        btn.innerText = map.name;
        btn.onclick = () => {
            document.body.removeChild(selectorDiv);
            onSelect(map.id);
        };
        listDiv.appendChild(btn);
    });
    selectorDiv.appendChild(listDiv);
    document.body.appendChild(selectorDiv);
}

export function bootFromQuery(onSelect) {
    const queryParams = new URLSearchParams(window.location.search);
    const requestedMapId = queryParams.get('map');

    if (requestedMapId && queryParams.get('autostart') === '1') {
        // Vale cualquier id de mapas/ (no solo AVAILABLE_MAPS): así los mapas
        // creados con el editor se juegan con ?map=<nombre>&autostart=1.
        onSelect(requestedMapId);
    } else {
        createMapSelector(onSelect);
    }
}
