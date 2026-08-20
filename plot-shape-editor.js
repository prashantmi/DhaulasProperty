const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "dhaulas-plot-editor-v1";
const IMAGE_SIZE = { width: 1653, height: 1219 };

const DEFAULT_STATE = {
  pixelsPerFoot: 5.5,
  showBackground: true,
  backgroundOpacity: 0.9,
  selectedShapeId: "portion-b",
  mode: "edit",
  selectedEdgeIndex: null,
  draft: {
    vertices: [],
    pointer: null,
  },
  shapes: [
    {
      id: "portion-b",
      name: "Portion B / 262.06 sq yd",
      fill: "rgba(37, 99, 235, 0.22)",
      stroke: "#1d4ed8",
      officialSqYd: 262.06,
      officialSqFt: 2358.57,
      vertices: [
        { x: 1030, y: 150 },
        { x: 1095, y: 157 },
        { x: 1128, y: 680 },
        { x: 970, y: 644 },
      ],
      edges: [
        { name: "Top edge (unmarked on scan)", targetFeet: null, locked: false },
        { name: "Shared boundary", targetFeet: 67.25, locked: false },
        { name: "Road frontage", targetFeet: 31.25, locked: false },
        { name: "Boundary with sold portion", targetFeet: 83, locked: false },
      ],
    },
    {
      id: "portion-c",
      name: "Portion C / 271.08 sq yd",
      fill: "rgba(245, 158, 11, 0.24)",
      stroke: "#b45309",
      officialSqYd: 271.08,
      officialSqFt: 2439.78,
      vertices: [
        { x: 1095, y: 157 },
        { x: 1210, y: 307 },
        { x: 1385, y: 459 },
        { x: 1436, y: 585 },
        { x: 1215, y: 741 },
        { x: 1128, y: 680 },
      ],
      edges: [
        { name: "Upper diagonal", targetFeet: 21 + 10 / 12, locked: false },
        { name: "Outer edge 2", targetFeet: 24 + 4 / 12, locked: false },
        { name: "Outer edge 3", targetFeet: 24 + 10 / 12, locked: false },
        { name: "Road-adjacent long edge", targetFeet: 53 + 1 / 12, locked: false },
        { name: "Lower connector", targetFeet: 17 + 11 / 12, locked: false },
        { name: "Shared boundary", targetFeet: 67.25, locked: false },
      ],
    },
  ],
};

const els = {};
let state = loadState() || clone(DEFAULT_STATE);
let dragState = null;
let draftSuppressedClick = false;
let saveTimer = null;

init();

function init() {
  bindElements();
  bindEvents();
  sanitizeState();
  render();
}

function bindElements() {
  els.svg = document.getElementById("editorSvg");
  els.backgroundImage = document.getElementById("backgroundImage");
  els.shapeLayer = document.getElementById("shapeLayer");
  els.draftLayer = document.getElementById("draftLayer");
  els.handleLayer = document.getElementById("handleLayer");
  els.editModeButton = document.getElementById("editModeButton");
  els.drawModeButton = document.getElementById("drawModeButton");
  els.finishPolygonButton = document.getElementById("finishPolygonButton");
  els.cancelPolygonButton = document.getElementById("cancelPolygonButton");
  els.resetButton = document.getElementById("resetButton");
  els.exportButton = document.getElementById("exportButton");
  els.importButton = document.getElementById("importButton");
  els.importInput = document.getElementById("importInput");
  els.showBackgroundCheckbox = document.getElementById("showBackgroundCheckbox");
  els.backgroundOpacityInput = document.getElementById("backgroundOpacityInput");
  els.pixelsPerFootInput = document.getElementById("pixelsPerFootInput");
  els.estimateScaleButton = document.getElementById("estimateScaleButton");
  els.shapeList = document.getElementById("shapeList");
  els.deleteShapeButton = document.getElementById("deleteShapeButton");
  els.shapeNameInput = document.getElementById("shapeNameInput");
  els.shapeSummary = document.getElementById("shapeSummary");
  els.lockKnownEdgesButton = document.getElementById("lockKnownEdgesButton");
  els.unlockEdgesButton = document.getElementById("unlockEdgesButton");
  els.edgeTableBody = document.getElementById("edgeTableBody");
}

function bindEvents() {
  els.editModeButton.addEventListener("click", () => setMode("edit"));
  els.drawModeButton.addEventListener("click", () => setMode("draw"));
  els.finishPolygonButton.addEventListener("click", finishDraftPolygon);
  els.cancelPolygonButton.addEventListener("click", clearDraft);
  els.resetButton.addEventListener("click", resetState);
  els.exportButton.addEventListener("click", exportState);
  els.importButton.addEventListener("click", () => els.importInput.click());
  els.importInput.addEventListener("change", importState);

  els.showBackgroundCheckbox.addEventListener("change", (event) => {
    state.showBackground = event.target.checked;
    requestSave();
    render();
  });

  els.backgroundOpacityInput.addEventListener("input", (event) => {
    state.backgroundOpacity = Number(event.target.value);
    requestSave();
    render();
  });

  els.pixelsPerFootInput.addEventListener("change", (event) => {
    const value = Number(event.target.value);
    if (value > 0) {
      state.pixelsPerFoot = value;
      requestSave();
      render();
    }
  });

  els.estimateScaleButton.addEventListener("click", () => {
    const estimate = estimatePixelsPerFoot();
    if (estimate) {
      state.pixelsPerFoot = round(estimate, 4);
      requestSave();
      render();
    }
  });

  els.deleteShapeButton.addEventListener("click", deleteSelectedShape);
  els.shapeNameInput.addEventListener("input", (event) => {
    const shape = getSelectedShape();
    if (!shape) return;
    shape.name = event.target.value;
    requestSave();
    render();
  });

  els.lockKnownEdgesButton.addEventListener("click", () => {
    const shape = getSelectedShape();
    if (!shape) return;
    shape.edges.forEach((edge, index) => {
      if (edge.targetFeet == null) {
        edge.targetFeet = measureEdgeFeet(shape, index);
      }
      edge.locked = true;
    });
    requestSave();
    render();
  });

  els.unlockEdgesButton.addEventListener("click", () => {
    const shape = getSelectedShape();
    if (!shape) return;
    shape.edges.forEach((edge) => {
      edge.locked = false;
    });
    requestSave();
    render();
  });

  els.svg.addEventListener("click", handleSvgClick);
  els.svg.addEventListener("pointermove", handleSvgPointerMove);
  window.addEventListener("pointermove", handleWindowPointerMove);
  window.addEventListener("pointerup", handleWindowPointerUp);
}

function render() {
  sanitizeState();
  syncControls();
  renderShapeList();
  renderShapeSummary();
  renderEdgeTable();
  renderCanvas();
}

function syncControls() {
  const isDrawMode = state.mode === "draw";
  const draftReady = state.draft.vertices.length >= 3;
  els.editModeButton.classList.toggle("is-active", !isDrawMode);
  els.drawModeButton.classList.toggle("is-active", isDrawMode);
  els.finishPolygonButton.disabled = !draftReady;
  els.cancelPolygonButton.disabled = state.draft.vertices.length === 0;
  els.showBackgroundCheckbox.checked = state.showBackground;
  els.backgroundOpacityInput.value = String(state.backgroundOpacity);
  els.pixelsPerFootInput.value = String(round(state.pixelsPerFoot, 4));
  els.backgroundImage.style.opacity = state.showBackground ? String(state.backgroundOpacity) : "0";
  els.backgroundImage.style.visibility = state.showBackground ? "visible" : "hidden";

  const selectedShape = getSelectedShape();
  els.shapeNameInput.disabled = !selectedShape;
  els.shapeNameInput.value = selectedShape ? selectedShape.name : "";
  els.deleteShapeButton.disabled = !selectedShape;
  els.lockKnownEdgesButton.disabled = !selectedShape;
  els.unlockEdgesButton.disabled = !selectedShape;
}

function renderShapeList() {
  els.shapeList.replaceChildren();

  state.shapes.forEach((shape) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "shape-chip";
    if (shape.id === state.selectedShapeId) {
      button.classList.add("is-selected");
    }
    button.addEventListener("click", () => {
      state.selectedShapeId = shape.id;
      requestSave();
      render();
    });

    const currentArea = measurePolygonArea(shape.vertices);
    button.innerHTML = `
      <span class="shape-chip-name">${escapeHtml(shape.name)}</span>
      <span class="shape-chip-meta">${formatAreaSqYd(currentArea.sqYd)} current</span>
    `;
    els.shapeList.appendChild(button);
  });
}

function renderShapeSummary() {
  const shape = getSelectedShape();
  els.shapeSummary.replaceChildren();

  if (!shape) {
    els.shapeSummary.textContent = "No shape selected.";
    return;
  }

  const area = measurePolygonArea(shape.vertices);
  const current = document.createElement("div");
  current.className = "summary-value";
  current.textContent = `${formatAreaSqYd(area.sqYd)} / ${formatAreaSqFt(area.sqFt)}`;

  const meta = document.createElement("div");
  meta.className = "summary-meta";
  const official = shape.officialSqYd != null
    ? `Registry reference: ${shape.officialSqYd.toFixed(2)} sq yd / ${shape.officialSqFt.toFixed(2)} sq ft`
    : "User-drawn shape";
  meta.textContent = official;

  els.shapeSummary.append(current, meta);
}

function renderEdgeTable() {
  els.edgeTableBody.replaceChildren();
  const shape = getSelectedShape();
  if (!shape) return;

  shape.edges.forEach((edge, index) => {
    const row = document.createElement("tr");
    const currentFeet = measureEdgeFeet(shape, index);
    const targetValue = edge.targetFeet == null ? "" : round(edge.targetFeet, 4);
    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="edge-name">
        ${escapeHtml(edge.name || `Edge ${index + 1}`)}
        <small>${formatFeetAndInches(currentFeet)}</small>
      </td>
      <td>${currentFeet.toFixed(2)}</td>
      <td><input type="number" min="0" step="0.01" value="${targetValue}" data-edge-target="${index}"></td>
      <td><input type="checkbox" ${edge.locked ? "checked" : ""} data-edge-lock="${index}"></td>
    `;
    els.edgeTableBody.appendChild(row);
  });

  els.edgeTableBody.querySelectorAll("[data-edge-target]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const shape = getSelectedShape();
      if (!shape) return;
      const index = Number(event.target.dataset.edgeTarget);
      const value = event.target.value.trim();
      shape.edges[index].targetFeet = value === "" ? null : Number(value);
      if (!Number.isFinite(shape.edges[index].targetFeet)) {
        shape.edges[index].targetFeet = null;
      }
      requestSave();
      render();
    });
  });

  els.edgeTableBody.querySelectorAll("[data-edge-lock]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const shape = getSelectedShape();
      if (!shape) return;
      const index = Number(event.target.dataset.edgeLock);
      const edge = shape.edges[index];
      if (event.target.checked && edge.targetFeet == null) {
        edge.targetFeet = measureEdgeFeet(shape, index);
      }
      edge.locked = event.target.checked;
      requestSave();
      render();
    });
  });
}

function renderCanvas() {
  els.shapeLayer.replaceChildren();
  els.handleLayer.replaceChildren();
  els.draftLayer.replaceChildren();
  const interactive = state.mode === "edit";

  state.shapes.forEach((shape) => {
    const selected = shape.id === state.selectedShapeId;
    const polygon = makeSvg("polygon", {
      points: shape.vertices.map(pointToString).join(" "),
      fill: shape.fill,
      stroke: shape.stroke,
      class: `shape-polygon${selected ? "" : " is-dimmed"}`,
      "pointer-events": interactive ? "auto" : "none",
    });
    polygon.addEventListener("pointerdown", (event) => startShapeDrag(shape.id, event));
    polygon.addEventListener("click", (event) => {
      event.stopPropagation();
      state.selectedShapeId = shape.id;
      state.selectedEdgeIndex = null;
      requestSave();
      render();
    });
    els.shapeLayer.appendChild(polygon);

    shape.edges.forEach((edge, index) => {
      const a = shape.vertices[index];
      const b = shape.vertices[(index + 1) % shape.vertices.length];
      const line = makeSvg("line", {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: shape.stroke,
        class: `shape-edge${edge.locked ? " is-locked" : ""}`,
        "pointer-events": interactive ? "auto" : "none",
      });
      line.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        insertVertexOnEdge(shape.id, index, svgPointFromEvent(event));
      });
      line.addEventListener("click", (event) => {
        event.stopPropagation();
        state.selectedShapeId = shape.id;
        state.selectedEdgeIndex = index;
        render();
      });
      els.shapeLayer.appendChild(line);

      const currentFeet = measureEdgeFeet(shape, index);
      const label = makeSvg("text", {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        class: "edge-label",
        transform: `rotate(${readableAngle(a, b)} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2})`,
      });
      label.textContent = formatFeetAndInches(currentFeet);
      els.shapeLayer.appendChild(label);
    });

    const area = measurePolygonArea(shape.vertices);
    const centroid = polygonCentroid(shape.vertices);
    const labelGroup = makeSvg("g", { class: "area-label" });
    const title = makeSvg("text", {
      x: centroid.x,
      y: centroid.y - 8,
      class: "area-label-title",
    });
    title.textContent = shape.name;
    const meta = makeSvg("text", {
      x: centroid.x,
      y: centroid.y + 28,
      class: "area-label-meta",
    });
    meta.textContent = `${formatAreaSqFt(area.sqFt)} / ${formatAreaSqYd(area.sqYd)}`;
    labelGroup.append(title, meta);
    els.shapeLayer.appendChild(labelGroup);

    if (selected && state.mode === "edit") {
      shape.vertices.forEach((vertex, index) => {
        const handle = makeSvg("circle", {
          cx: vertex.x,
          cy: vertex.y,
          r: 10,
          fill: shape.stroke,
          class: "vertex-handle",
        });
        handle.addEventListener("pointerdown", (event) => startVertexDrag(shape.id, index, event));
        handle.addEventListener("click", (event) => {
          event.stopPropagation();
        });
        els.handleLayer.appendChild(handle);
      });
    }
  });

  renderDraft();
}

function renderDraft() {
  const vertices = state.draft.vertices;
  if (vertices.length === 0) return;

  const points = vertices.slice();
  if (state.draft.pointer) {
    points.push(state.draft.pointer);
  }

  const draftShape = points.length >= 3 ? "polygon" : "polyline";
  const poly = makeSvg(draftShape, {
    points: points.map(pointToString).join(" "),
    class: "draft-polyline",
  });
  els.draftLayer.appendChild(poly);

  vertices.forEach((vertex) => {
    const handle = makeSvg("circle", {
      cx: vertex.x,
      cy: vertex.y,
      r: 8,
      class: "draft-handle",
    });
    els.draftLayer.appendChild(handle);
  });
}

function handleSvgClick(event) {
  if (dragState && dragState.moved) return;
  if (draftSuppressedClick) {
    draftSuppressedClick = false;
    return;
  }
  if (state.mode !== "draw") return;

  const point = svgPointFromEvent(event);
  if (state.draft.vertices.length >= 3) {
    const first = state.draft.vertices[0];
    if (distance(first, point) <= 16) {
      finishDraftPolygon();
      return;
    }
  }
  state.draft.vertices.push(clampPoint(point));
  render();
}

function handleSvgPointerMove(event) {
  if (state.mode === "draw") {
    state.draft.pointer = svgPointFromEvent(event);
    renderDraftOnly();
  }
}

function renderDraftOnly() {
  els.draftLayer.replaceChildren();
  renderDraft();
}

function handleWindowPointerMove(event) {
  if (!dragState) return;

  const point = clampPoint(svgPointFromEvent(event));
  dragState.moved = true;

  if (dragState.type === "vertex") {
    const shape = getShapeById(dragState.shapeId);
    if (!shape) return;
    shape.vertices[dragState.vertexIndex] = applyLockedConstraints(shape, dragState.vertexIndex, point);
  } else if (dragState.type === "shape") {
    const shape = getShapeById(dragState.shapeId);
    if (!shape) return;
    const delta = {
      x: point.x - dragState.lastPoint.x,
      y: point.y - dragState.lastPoint.y,
    };
    shape.vertices.forEach((vertex) => {
      vertex.x += delta.x;
      vertex.y += delta.y;
    });
    dragState.lastPoint = point;
  }

  requestSave();
  render();
}

function handleWindowPointerUp() {
  if (!dragState) return;
  draftSuppressedClick = dragState.moved;
  dragState = null;
  requestSave();
}

function startVertexDrag(shapeId, vertexIndex, event) {
  if (state.mode !== "edit") return;
  event.stopPropagation();
  event.preventDefault();
  state.selectedShapeId = shapeId;
  dragState = {
    type: "vertex",
    shapeId,
    vertexIndex,
    moved: false,
  };
  render();
}

function startShapeDrag(shapeId, event) {
  if (state.mode !== "edit") return;
  event.preventDefault();
  event.stopPropagation();
  state.selectedShapeId = shapeId;
  dragState = {
    type: "shape",
    shapeId,
    lastPoint: svgPointFromEvent(event),
    moved: false,
  };
  render();
}

function applyLockedConstraints(shape, vertexIndex, desiredPoint) {
  const count = shape.vertices.length;
  const prevIndex = (vertexIndex - 1 + count) % count;
  const nextIndex = (vertexIndex + 1) % count;
  const prevEdge = shape.edges[prevIndex];
  const nextEdge = shape.edges[vertexIndex];
  const prevVertex = shape.vertices[prevIndex];
  const nextVertex = shape.vertices[nextIndex];
  const prevRadius = prevEdge.locked && prevEdge.targetFeet != null
    ? prevEdge.targetFeet * state.pixelsPerFoot
    : null;
  const nextRadius = nextEdge.locked && nextEdge.targetFeet != null
    ? nextEdge.targetFeet * state.pixelsPerFoot
    : null;

  if (prevRadius != null && nextRadius != null) {
    return circleIntersectionNear(prevVertex, prevRadius, nextVertex, nextRadius, desiredPoint);
  }
  if (prevRadius != null) {
    return pointOnCircleToward(prevVertex, prevRadius, desiredPoint);
  }
  if (nextRadius != null) {
    return pointOnCircleToward(nextVertex, nextRadius, desiredPoint);
  }
  return desiredPoint;
}

function pointOnCircleToward(center, radius, toward) {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const length = Math.hypot(dx, dy) || 1;
  return clampPoint({
    x: center.x + (dx / length) * radius,
    y: center.y + (dy / length) * radius,
  });
}

function circleIntersectionNear(a, radiusA, b, radiusB, preferred) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (!d) {
    return preferred;
  }

  const cosArg = (radiusA * radiusA + d * d - radiusB * radiusB) / (2 * radiusA * d);
  const clamped = Math.max(-1, Math.min(1, cosArg));
  const baseAngle = Math.atan2(dy, dx);
  const offset = Math.acos(clamped);

  const candidates = [
    {
      x: a.x + Math.cos(baseAngle + offset) * radiusA,
      y: a.y + Math.sin(baseAngle + offset) * radiusA,
    },
    {
      x: a.x + Math.cos(baseAngle - offset) * radiusA,
      y: a.y + Math.sin(baseAngle - offset) * radiusA,
    },
  ];

  candidates.sort((left, right) => distance(left, preferred) - distance(right, preferred));
  return clampPoint(candidates[0]);
}

function insertVertexOnEdge(shapeId, edgeIndex, point) {
  const shape = getShapeById(shapeId);
  if (!shape) return;

  shape.vertices.splice(edgeIndex + 1, 0, clampPoint(point));
  shape.edges.splice(edgeIndex, 1, blankEdge(), blankEdge());
  state.selectedShapeId = shapeId;
  requestSave();
  render();
}

function blankEdge() {
  return {
    name: "Inserted edge",
    targetFeet: null,
    locked: false,
  };
}

function finishDraftPolygon() {
  if (state.draft.vertices.length < 3) return;

  const sequence = state.shapes.length + 1;
  const shape = {
    id: `shape-${Date.now()}`,
    name: `Shape ${sequence}`,
    fill: randomFill(sequence),
    stroke: randomStroke(sequence),
    officialSqYd: null,
    officialSqFt: null,
    vertices: state.draft.vertices.map((vertex) => ({ ...vertex })),
    edges: state.draft.vertices.map(() => blankEdge()),
  };
  state.shapes.push(shape);
  state.selectedShapeId = shape.id;
  clearDraft(false);
  requestSave();
  render();
}

function clearDraft(renderAfter = true) {
  state.draft.vertices = [];
  state.draft.pointer = null;
  if (state.mode === "draw") {
    state.mode = "edit";
  }
  if (renderAfter) {
    render();
  }
}

function deleteSelectedShape() {
  if (state.shapes.length === 0) return;
  const shape = getSelectedShape();
  if (!shape) return;
  const confirmed = window.confirm(`Delete "${shape.name}"?`);
  if (!confirmed) return;

  state.shapes = state.shapes.filter((item) => item.id !== shape.id);
  state.selectedShapeId = state.shapes[0] ? state.shapes[0].id : null;
  requestSave();
  render();
}

function setMode(mode) {
  state.mode = mode;
  state.draft.pointer = null;
  if (mode === "edit") {
    clearDraft(false);
  } else {
    state.draft.vertices = [];
  }
  render();
}

function resetState() {
  const confirmed = window.confirm("Reset the editor back to the initial traced overlay?");
  if (!confirmed) return;
  state = clone(DEFAULT_STATE);
  requestSave(true);
  render();
}

function exportState() {
  const payload = {
    pixelsPerFoot: state.pixelsPerFoot,
    showBackground: state.showBackground,
    backgroundOpacity: state.backgroundOpacity,
    selectedShapeId: state.selectedShapeId,
    shapes: state.shapes,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "dhaulas-plot-editor-state.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function importState(event) {
  const [file] = event.target.files || [];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      state = {
        ...clone(DEFAULT_STATE),
        ...payload,
        draft: { vertices: [], pointer: null },
        mode: "edit",
      };
      sanitizeState();
      requestSave(true);
      render();
    } catch (error) {
      window.alert(`Could not import file: ${error.message}`);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function estimatePixelsPerFoot() {
  const ratios = [];
  state.shapes.forEach((shape) => {
    shape.edges.forEach((edge, index) => {
      if (edge.targetFeet != null && edge.targetFeet > 0) {
        const a = shape.vertices[index];
        const b = shape.vertices[(index + 1) % shape.vertices.length];
        ratios.push(distance(a, b) / edge.targetFeet);
      }
    });
  });

  if (!ratios.length) return null;
  ratios.sort((left, right) => left - right);
  const mid = Math.floor(ratios.length / 2);
  return ratios.length % 2 === 0 ? (ratios[mid - 1] + ratios[mid]) / 2 : ratios[mid];
}

function getSelectedShape() {
  return getShapeById(state.selectedShapeId);
}

function getShapeById(id) {
  return state.shapes.find((shape) => shape.id === id) || null;
}

function measureEdgeFeet(shape, index) {
  const a = shape.vertices[index];
  const b = shape.vertices[(index + 1) % shape.vertices.length];
  return distance(a, b) / state.pixelsPerFoot;
}

function measurePolygonArea(vertices) {
  const areaPixels = polygonArea(vertices);
  const sqFt = areaPixels / (state.pixelsPerFoot * state.pixelsPerFoot);
  return {
    sqFt,
    sqYd: sqFt / 9,
  };
}

function polygonArea(vertices) {
  let total = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    total += current.x * next.y - next.x * current.y;
  }
  return Math.abs(total) / 2;
}

function polygonCentroid(vertices) {
  let areaFactor = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < vertices.length; index += 1) {
    const current = vertices[index];
    const next = vertices[(index + 1) % vertices.length];
    const cross = current.x * next.y - next.x * current.y;
    areaFactor += cross;
    x += (current.x + next.x) * cross;
    y += (current.y + next.y) * cross;
  }

  if (Math.abs(areaFactor) < 0.0001) {
    return averagePoint(vertices);
  }

  const factor = 1 / (3 * areaFactor);
  return {
    x: x * factor,
    y: y * factor,
  };
}

function averagePoint(vertices) {
  const total = vertices.reduce(
    (accumulator, vertex) => {
      accumulator.x += vertex.x;
      accumulator.y += vertex.y;
      return accumulator;
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / vertices.length,
    y: total.y / vertices.length,
  };
}

function readableAngle(a, b) {
  let angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
  if (angle > 90 || angle < -90) {
    angle += 180;
  }
  return round(angle, 2);
}

function svgPointFromEvent(event) {
  const point = els.svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(els.svg.getScreenCTM().inverse());
  return { x: transformed.x, y: transformed.y };
}

function pointToString(point) {
  return `${round(point.x, 2)},${round(point.y, 2)}`;
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function clampPoint(point) {
  return {
    x: Math.max(0, Math.min(IMAGE_SIZE.width, point.x)),
    y: Math.max(0, Math.min(IMAGE_SIZE.height, point.y)),
  };
}

function formatFeetAndInches(feet) {
  if (!Number.isFinite(feet)) return "0'";
  const totalInches = Math.round(feet * 12);
  const wholeFeet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${wholeFeet}'-${inches}"`;
}

function formatAreaSqFt(value) {
  return `${value.toFixed(2)} sq ft`;
}

function formatAreaSqYd(value) {
  return `${value.toFixed(2)} sq yd`;
}

function randomFill(sequence) {
  const fills = [
    "rgba(14, 165, 233, 0.18)",
    "rgba(34, 197, 94, 0.2)",
    "rgba(168, 85, 247, 0.18)",
    "rgba(244, 63, 94, 0.18)",
  ];
  return fills[sequence % fills.length];
}

function randomStroke(sequence) {
  const strokes = ["#0284c7", "#15803d", "#7e22ce", "#be123c"];
  return strokes[sequence % strokes.length];
}

function makeSvg(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  return node;
}

function sanitizeState() {
  if (!Array.isArray(state.shapes)) {
    state.shapes = clone(DEFAULT_STATE.shapes);
  }
  state.shapes.forEach((shape) => {
    if (!Array.isArray(shape.vertices)) {
      shape.vertices = [];
    }
    if (!Array.isArray(shape.edges) || shape.edges.length !== shape.vertices.length) {
      shape.edges = shape.vertices.map((_, index) => shape.edges?.[index] || blankEdge());
    }
  });
  if (!state.selectedShapeId || !getShapeById(state.selectedShapeId)) {
    state.selectedShapeId = state.shapes[0] ? state.shapes[0].id : null;
  }
  if (!Number.isFinite(state.pixelsPerFoot) || state.pixelsPerFoot <= 0) {
    state.pixelsPerFoot = DEFAULT_STATE.pixelsPerFoot;
  }
  if (typeof state.showBackground !== "boolean") {
    state.showBackground = true;
  }
  if (!Number.isFinite(state.backgroundOpacity)) {
    state.backgroundOpacity = DEFAULT_STATE.backgroundOpacity;
  }
  if (!state.draft || !Array.isArray(state.draft.vertices)) {
    state.draft = { vertices: [], pointer: null };
  }
  if (state.mode !== "edit" && state.mode !== "draw") {
    state.mode = "edit";
  }
}

function requestSave(immediate = false) {
  window.clearTimeout(saveTimer);
  if (immediate) {
    saveState();
    return;
  }
  saveTimer = window.setTimeout(saveState, 200);
}

function saveState() {
  const payload = {
    pixelsPerFoot: state.pixelsPerFoot,
    showBackground: state.showBackground,
    backgroundOpacity: state.backgroundOpacity,
    selectedShapeId: state.selectedShapeId,
    shapes: state.shapes,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Could not parse saved editor state.", error);
    return null;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
