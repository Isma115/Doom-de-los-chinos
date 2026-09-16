// Helpers DOM para la UI: evitan repetir getElementById/createElement
// en cada método de UIManager/SettingsManager/DebugPanel.
export function el(id) {
    return document.getElementById(id);
}

export function ensureEl(id, tag = 'div', parent = null) {
    let node = document.getElementById(id);
    if (node) return node;
    node = document.createElement(tag);
    node.id = id;
    (parent ?? document.getElementById('ui-layer') ?? document.body).appendChild(node);
    return node;
}

export function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.innerText = text;
    return node;
}

export function showNode(node, display = 'block') {
    if (typeof node === 'string') node = document.getElementById(node);
    if (node) node.style.display = display;
}

export function hideNode(node) {
    if (typeof node === 'string') node = document.getElementById(node);
    if (node) node.style.display = 'none';
}
