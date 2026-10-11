import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  FilePlus2,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronRight,
  Search,
  Settings2,
  HelpCircle,
  X,
  Check,
  Square,
  Circle,
  MousePointer2,
  MoveUpRight,
  RotateCw,
  Scissors,
  CornerDownRight,
  Layers,
  Grid3X3,
  Maximize,
  Eye,
  Ruler,
  Download,
  Crosshair,
  Plus,
  Trash2,
  Pencil,
  PanelLeft,
  Component,
  SlidersHorizontal,
  Move3D,
  Info,
  AlertTriangle,
  Loader2,
  ChevronUp,
  CheckCircle2,
  ScanLine,
  Triangle,
  Minus,
  Spline,
  PanelTop,
  BoxSelect,
  Cone,
  ArrowRightToLine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Viewport, { type ViewName } from "./components/Viewport";
import SketchCanvas from "./components/SketchCanvas";
import EntitySketchPanel from "./components/EntitySketchPanel";
import SketchChamferPanel from "./components/SketchChamferPanel";
import type { ChamferPlan } from "./sketch/chamfer";
import SketchFilletPanel from "./components/SketchFilletPanel";
import type { FilletPlan } from "./sketch/fillet";
import PlaneSupportPanel, {
  supportLabel,
} from "./components/PlaneSupportPanel";
import { solveSketch } from "./sketch/solver";
import { validateEntityProfile } from "./sketch/validation";
import { convertProfile, emptySketch, removeSelection } from "./sketch/editing";
import type {
  EntityProfile,
  LegacyProfile,
  SketchSelection,
  SketchTool,
} from "./sketch/types";
import { createConstrainedPlateDocument } from "./model/sketch-examples";
import {
  createAngularPlateDocument,
  createTangentPlateDocument,
} from "./examples/sketch-relations";
import { createMeasuredPlateDocument } from "./examples/driven-dimensions";
import { createTrimSketchDocument } from "./examples/sketch-trim";
import { createExtendSketchDocument } from "./examples/sketch-extend";
import { createChamferSketchDocument } from "./examples/sketch-chamfer";
import { createFilletSketchDocument } from "./examples/sketch-fillet";
import { createFilletProlongationDocument } from "./examples/sketch-fillet-prolongation";
import {
  createLoftExample,
  createSweepExample,
} from "./examples/advanced-shapes";
import EdgeFinishPanel, { sameEdge } from "./components/EdgeFinishPanel";
import SweepLoftPanel from "./components/SweepLoftPanel";
import PatternPanel from "./components/PatternPanel";
import FaceOperationPanel, { sameFace } from "./components/FaceOperationPanel";
import ExtrudePanel from "./components/ExtrudePanel";
import HolePanel, { type HoleSection } from "./components/HolePanel";
import HolePositionsCanvas from "./components/HolePositionsCanvas";
import {
  createHoleExample,
  type HoleExampleKind,
} from "./examples/hole-wizard";
import {
  principalPlaneFrame,
  frameYDirection,
  frameDot,
} from "./cad/kernel.frames";
import {
  createExtrudeEndExample,
  type ExtrudeExampleKind,
} from "./examples/extrude-end-conditions";
import { createFaceOperationExample } from "./examples/face-operations";
import {
  createLinearPatternExample,
  createCircularPatternExample,
  createMirrorExample,
} from "./examples/patterns";
import { featureSketchIds } from "./model/featureInputs";
import { initialLoftSection, resolvedSweepPath } from "./model/advancedInputs";
import { buildModel, exportCad, initKernel } from "./cad/kernel";
import type {
  Feature,
  SketchFeature,
  Plane,
  CadResult,
  Profile,
  EdgeFinishFeature,
  EdgeReference,
  PickableFace,
  PlaneSupport,
  ReferencePlaneFeature,
  RepetitionFeature,
  FaceOperationFeature,
  HoleFeature,
  PlaneFrame,
  Vec3,
} from "./cad/kernel.types";
import {
  createDemoDocument,
  createDocument,
  parseDocument,
  serializeDocument,
  addFeature,
  updateFeature,
  removeFeature,
  DocumentHistory,
  type Document,
} from "./model/document";

const planeNames: Record<Plane, string> = {
  XY: "Alzado",
  XZ: "Planta",
  YZ: "Vista lateral",
};
const labels: Record<string, string> = {
  sketch: "Croquis",
  extrude: "Saliente-Extruir",
  cut: "Corte-Extruir",
  revolve: "Saliente-Revolución",
  fillet: "Redondeo",
  chamfer: "Chaflán",
  plane: "Plano",
  sweep: "Saliente-Barrido",
  loft: "Saliente-Recubrir",
  linearPattern: "Matriz-Lineal",
  circularPattern: "Matriz-Circular",
  mirror: "Simetría",
  shell: "Vaciado",
  draft: "Desmoldeo",
  hole: "Taladro",
};
const featureIcons: Record<string, LucideIcon> = {
  sketch: Pencil,
  extrude: Box,
  cut: Scissors,
  revolve: RotateCw,
  fillet: CornerDownRight,
  chamfer: Triangle,
  plane: PanelTop,
  sweep: MoveUpRight,
  loft: Layers,
  linearPattern: Grid3X3,
  circularPattern: RotateCw,
  mirror: Component,
  shell: BoxSelect,
  draft: Cone,
  hole: Crosshair,
};
function isFaceOperation(
  feature: Feature | null,
): feature is FaceOperationFeature {
  return feature?.type === "shell" || feature?.type === "draft";
}
function isRepetition(feature: Feature | null): feature is RepetitionFeature {
  return (
    feature?.type === "linearPattern" ||
    feature?.type === "circularPattern" ||
    feature?.type === "mirror"
  );
}
function isEdgeFinish(feature: Feature | null): feature is EdgeFinishFeature {
  return feature?.type === "fillet" || feature?.type === "chamfer";
}
function initialDocument() {
  try {
    const saved = localStorage.getItem("solidflow.autosave");
    if (saved) return parseDocument(saved);
  } catch {
    /* Invalid recovery data does not replace a valid document. */
  }
  return createDemoDocument();
}
function download(blob: Blob, name: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 2000);
}
function IconButton({
  icon: Icon,
  title,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={"icon-button " + (active ? "active" : "")}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={17} strokeWidth={1.65} />
    </button>
  );
}
function Command({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  active = false,
  large = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  large?: boolean;
}) {
  return (
    <button
      className={`command ${large ? "large" : ""} ${active ? "active" : ""}`}
      title={disabled ? `${label}: todavía no disponible` : label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={large ? 30 : 22} strokeWidth={1.45} />
      <span>{label}</span>
      {large && <ChevronDown size={10} />}
    </button>
  );
}
function NumberField({
  label,
  value,
  onChange,
  unit = "mm",
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  step?: number;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? 0 : Number(e.target.value))
          }
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}

export default function App() {
  const [doc, setDoc] = useState<Document>(initialDocument);
  const history = useRef<DocumentHistory | null>(null);
  if (!history.current) history.current = new DocumentHistory(doc);
  const [model, setModel] = useState<CadResult | null>(null),
    [busy, setBusy] = useState(true),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [builtFeatures, setBuiltFeatures] = useState<Feature[] | null>(null);
  const [edgeSelection, setEdgeSelection] = useState<EdgeReference[]>([]);
  const [selectionMode, setSelectionMode] = useState<"body" | "edge" | "face">(
    "body",
  );
  const [faceSelection, setFaceSelection] = useState<PickableFace | null>(null);
  const [pickingSupport, setPickingSupport] = useState(false);
  const [pickingEndFace, setPickingEndFace] = useState(false);
  const [holeSection, setHoleSection] = useState<HoleSection>("type");
  const [selectedHolePosition, setSelectedHolePosition] = useState<
    string | null
  >(null);
  const [showPlanes, setShowPlanes] = useState(false);
  const [finishPreview, setFinishPreview] = useState(false);
  const [facePreview, setFacePreview] = useState(false);
  const [sourceModel, setSourceModel] = useState<CadResult | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Feature | null>(null),
    [plane, setPlane] = useState<Plane>("XY");
  const [tab, setTab] = useState("Operaciones"),
    [display, setDisplay] = useState<"shaded" | "edges" | "wire">("edges"),
    [grid, setGrid] = useState(false);
  const [view, setView] = useState<{ name: ViewName; stamp: number }>({
      name: "iso",
      stamp: 0,
    }),
    [sketchTool, setSketchTool] = useState<SketchTool>("rectangle");
  const [sketchSelection, setSketchSelection] = useState<SketchSelection[]>([]);
  const [chamferPreview, setChamferPreview] = useState<ChamferPlan | null>(null);
  const [filletPreview, setFilletPreview] = useState<FilletPlan | null>(null);
  const [previousFilletId, setPreviousFilletId] = useState<string | null>(null);
  const filletSessionIds = useRef<string[]>([]);
  const [sketchPast, setSketchPast] = useState<SketchFeature[]>([]);
  const [sketchFuture, setSketchFuture] = useState<SketchFeature[]>([]);
  const [sketchInspector, setSketchInspector] = useState<{
    name: "dimensions" | "relations";
    stamp: number;
  }>({ name: "dimensions", stamp: 0 });
  const [menu, setMenu] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [toastError, setToastError] = useState(false),
    [panel, setPanel] = useState<"design" | "properties" | null>(null),
    [showHelp, setShowHelp] = useState(false),
    [rename, setRename] = useState(false),
    [discardOpen, setDiscardOpen] = useState(false);
  const [filePath, setFilePath] = useState<string | undefined>(),
    [saved, setSaved] = useState(""),
    [exporting, setExporting] = useState(false),
    [treeOpen, setTreeOpen] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileOperation = useRef(false);
  const discardDecision = useRef<((accepted: boolean) => void) | null>(null);
  const discardDialog = useRef<HTMLDivElement>(null);
  const docRef = useRef(doc);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  docRef.current = doc;
  const selectedFeature = doc.features.find((f) => f.id === selected);
  useEffect(() => {
    if (editing) return;
    setFaceSelection((previous) =>
      previous
        ? (model?.faces?.find(
            (face) =>
              face.ref.key === previous.ref.key &&
              face.ref.sourceFeatureId === previous.ref.sourceFeatureId,
          ) ?? null)
        : null,
    );
  }, [model, editing]);
  // A legacy sketch is displayed as entities during the tool, but conversion
  // enters history only together with a successfully applied fillet.
  const filletConvertedProfile = useMemo(() =>
    sketchTool === "fillet" && editing?.type === "sketch" && editing.profile.kind !== "entities"
      ? convertProfile(editing.profile) : null,
  [sketchTool === "fillet", editing?.type === "sketch" ? editing.profile : null]);
  const entityProfile =
    editing?.type === "sketch" && editing.profile.kind === "entities"
      ? editing.profile
      : filletConvertedProfile;
  useEffect(() => {
    const ids = new Set(entityProfile?.entities.filter(entity => entity.type === "arc").map(entity => entity.id));
    if (sketchTool === "fillet")
      setPreviousFilletId(filletSessionIds.current.filter(id => ids.has(id)).at(-1) ?? null);
  }, [entityProfile, sketchTool]);
  const sketchSolution = useMemo(
    () => (entityProfile ? solveSketch(entityProfile) : null),
    [entityProfile],
  );
  const selectedSketch =
    selectedFeature?.type === "sketch"
      ? selectedFeature
      : (doc.features.find(
          (f) =>
            f.type === "sketch" &&
            f.id ===
              (selectedFeature ? featureSketchIds(selectedFeature)[0] : ""),
        ) as SketchFeature | undefined);
  const effectiveFeatures = useMemo(() => {
    if (!editing) return doc.features;
    const index = doc.features.findIndex(
      (feature) => feature.id === editing.id,
    );
    // Editing rolls the body back to this feature. Following operations rebuild
    // after acceptance and can report lost references without blocking the edit.
    return [
      ...doc.features.slice(0, index < 0 ? doc.features.length : index),
      editing,
    ];
  }, [doc.features, editing]);
  const finishEditing = isEdgeFinish(editing) ? editing : null;
  const mirrorEditing = editing?.type === "mirror" ? editing : null;
  const faceEditing = isFaceOperation(editing) ? editing : null;
  const extrudeEditing =
    editing?.type === "extrude" || editing?.type === "cut" ? editing : null;
  const holeEditing = editing?.type === "hole" ? editing : null;
  const sourceFeatures = useMemo(() => {
    const sourceEditing =
      finishEditing ??
      mirrorEditing ??
      faceEditing ??
      extrudeEditing ??
      holeEditing;
    if (!sourceEditing) return null;
    const index = doc.features.findIndex(
      (feature) => feature.id === sourceEditing.id,
    );
    return doc.features.slice(0, index < 0 ? doc.features.length : index);
  }, [
    doc.features,
    finishEditing?.id,
    mirrorEditing?.id,
    faceEditing?.id,
    extrudeEditing?.id,
    holeEditing?.id,
  ]);
  const pickingFinish = !!finishEditing && !finishPreview;
  const pickingMirror = !!mirrorEditing && pickingSupport;
  const pickingFaceOperation =
    !!faceEditing && (!facePreview || pickingSupport);
  const pickingExtrude =
    !!extrudeEditing &&
    extrudeEditing.endCondition?.kind === "upToSurface" &&
    pickingEndFace;
  const pickingHole = !!holeEditing && pickingSupport;
  const placingHoles =
    !!holeEditing && holeSection === "positions" && !pickingHole;
  const visibleModel =
    pickingFinish ||
    pickingMirror ||
    pickingFaceOperation ||
    pickingExtrude ||
    pickingHole
      ? sourceModel
      : model;
  const operationFaces =
    faceEditing?.type === "shell"
      ? faceEditing.removedFaces
      : (faceEditing?.faces ?? []);
  const selectedEdges = finishEditing
    ? finishEditing.selection.mode === "selected"
      ? finishEditing.selection.edges
      : (sourceModel?.edges ?? []).map((edge) => edge.ref)
    : edgeSelection;
  const emptyEdgeSelection =
    finishEditing?.selection.mode === "selected" &&
    finishEditing.selection.edges.length === 0;
  const visibleError =
    emptyEdgeSelection ||
    (faceEditing?.type === "draft" &&
      !operationFaces.length &&
      error === "Selecciona al menos una cara para desmoldear.")
      ? ""
      : error;
  const dirty = serializeDocument(doc) !== saved || editing !== null;
  const previewCurrent = builtFeatures === effectiveFeatures;
  const editingResolved =
    !editing ||
    editing.suppressed ||
    (editing.type === "sketch"
      ? model?.sketches?.some((sketch) => sketch.id === editing.id)
      : editing.type === "plane"
        ? model?.planes?.some((reference) => reference.id === editing.id)
        : model?.faces?.some(
            (face) => face.ref.sourceFeatureId === editing.id,
          ));
  const canAccept =
    !!editing &&
    !!editingResolved &&
    !pickingMirror &&
    !pickingExtrude &&
    !pickingHole &&
    !(faceEditing && pickingSupport) &&
    ready &&
    !busy &&
    previewCurrent &&
    !!model &&
    !error &&
    (!sketchSolution ||
      ["underdefined", "fullyDefined"].includes(sketchSolution.status)) &&
    (editing.type !== "sketch" ||
      sketchTool !== "chamfer" ||
      !!chamferPreview?.changed) &&
    (editing.type !== "sketch" || sketchTool !== "fillet" || !!filletPreview?.changed) &&
    model.featureErrors.length === 0;
  const canExport =
    !editing &&
    ready &&
    !busy &&
    previewCurrent &&
    !!model?.vertices.length &&
    !error &&
    !exporting;
  const notify = (message: string, isError = false) => {
    setToast(message);
    setToastError(isError);
  };
  const requireFinishedEdit = () => {
    if (!editing) return true;
    notify("Acepta o cancela la operación en curso antes de continuar.");
    return false;
  };
  const editFeature = (feature: Feature) => {
    setPickingEndFace(false);
    if (!requireFinishedEdit()) return;
    setHoleSection("type");
    setSelectedHolePosition(
      feature.type === "hole" ? (feature.positions[0]?.id ?? null) : null,
    );
    setEditing(structuredClone(feature));
    setFinishPreview(false);
    setFacePreview(false);
    setEdgeSelection([]);
    setFaceSelection(null);
    setPickingSupport(false);
    setSelectionMode("body");
    setTab(feature.type === "sketch" ? "Croquis" : "Operaciones");
    if (feature.type === "sketch") {
      setSketchTool("select");
      setSketchSelection([]);
      setSketchPast([]);
      setSketchFuture([]);
    }
  };
  const apply = (next: Document) => {
    setDoc(history.current!.apply(next));
    setError("");
  };
  const changeView = (name: ViewName) => setView({ name, stamp: Date.now() });
  useEffect(() => {
    initKernel()
      .then(() => setReady(true))
      .catch((e) => {
        setError(`No se pudo iniciar el motor geométrico: ${e.message}`);
        setBusy(false);
      });
  }, []);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    setBusy(true);
    const timer = setTimeout(() => {
      buildModel(effectiveFeatures)
        .then((result) => {
          if (active) {
            setModel(result);
            setBuiltFeatures(effectiveFeatures);
            setBusy(false);
            setError(result.featureErrors.map((e) => e.message).join(" · "));
          }
        })
        .catch((e) => {
          if (active) {
            setBuiltFeatures(null);
            setError(e.message);
            setBusy(false);
          }
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [effectiveFeatures, ready]);
  useEffect(() => {
    if (!ready || !sourceFeatures) {
      setSourceModel(null);
      setSourceLoading(false);
      return;
    }
    let active = true;
    setSourceLoading(true);
    setSourceModel(null);
    buildModel(sourceFeatures)
      .then((result) => {
        if (active) {
          setSourceModel(result);
          setSourceLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setSourceLoading(false);
          setError(reason.message);
        }
      });
    return () => {
      active = false;
    };
  }, [ready, sourceFeatures]);
  useEffect(() => {
    setEdgeSelection([]);
  }, [doc.features]);
  useEffect(() => {
    try {
      localStorage.setItem("solidflow.autosave", serializeDocument(doc));
    } catch {
      notify(
        "No se pudo guardar la recuperación local. Guarda la pieza en un archivo.",
      );
    }
  }, [doc]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!discardOpen) return;
    const previousFocus = document.activeElement;
    discardDialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [discardOpen]);
  useEffect(
    () => () => {
      const resolve = discardDecision.current;
      discardDecision.current = null;
      resolve?.(false);
    },
    [],
  );
  const reset = (next: Document, path?: string, markSaved = false) => {
    setPickingEndFace(false);
    setHoleSection("type");
    setSelectedHolePosition(null);
    setDoc(history.current!.reset(next));
    setModel(null);
    setBuiltFeatures(null);
    setEditing(null);
    setSelected(null);
    setSelectionMode("body");
    setEdgeSelection([]);
    setFaceSelection(null);
    setPickingSupport(false);
    setSourceModel(null);
    setFilePath(path);
    setSaved(markSaved ? serializeDocument(next) : "");
    setError("");
    changeView("iso");
  };
  const finishDiscard = (accepted: boolean) => {
    const resolve = discardDecision.current;
    discardDecision.current = null;
    setDiscardOpen(false);
    resolve?.(accepted);
  };
  const canReplace = async (): Promise<boolean> => {
    // A second shortcut must not queue another document replacement.
    if (discardDecision.current) return false;
    if (fileOperation.current) {
      notify("Espera a que termine la operación de archivo actual.");
      return false;
    }
    if (!dirty) return true;
    return new Promise<boolean>((resolve) => {
      discardDecision.current = resolve;
      setDiscardOpen(true);
    });
  };
  const newDoc = async () => {
    if (await canReplace()) reset(createDocument("Pieza1"));
  };
  const loadDemo = async () => {
    if (await canReplace()) reset(createDemoDocument());
  };
  const loadConstrainedDemo = async () => {
    if (await canReplace()) reset(createConstrainedPlateDocument());
  };
  const loadSketchRelationsDemo = async (
    kind: "angle" | "tangent" | "driven",
  ) => {
    if (await canReplace())
      reset(
        kind === "angle"
          ? createAngularPlateDocument()
          : kind === "tangent"
            ? createTangentPlateDocument()
            : createMeasuredPlateDocument(),
      );
  };
  const loadAdvancedDemo = async (kind: "sweep" | "loft") => {
    if (await canReplace())
      reset(kind === "sweep" ? createSweepExample() : createLoftExample());
  };
  const loadTrimDemo = async () => {
    if (await canReplace()) reset(createTrimSketchDocument());
  };
  const loadExtendDemo = async () => {
    if (await canReplace()) reset(createExtendSketchDocument());
  };
  const loadChamferDemo = async () => {
    if (await canReplace()) reset(createChamferSketchDocument());
  };
  const loadFilletDemo = async (kind: "rectangle" | "curved" = "rectangle") => {
    if (await canReplace()) reset(createFilletSketchDocument(kind));
  };
  const loadFilletProlongationDemo = async (kind: "line-arc" | "arc-arc") => {
    if (await canReplace()) reset(createFilletProlongationDocument(kind));
  };
  const loadPatternDemo = async (kind: RepetitionFeature["type"]) => {
    if (await canReplace())
      reset(
        kind === "linearPattern"
          ? createLinearPatternExample()
          : kind === "circularPattern"
            ? createCircularPatternExample()
            : createMirrorExample(),
      );
  };
  const loadFaceDemo = async (kind: FaceOperationFeature["type"]) => {
    if (!(await canReplace())) return;
    const documentBefore = docRef.current;
    const editBefore = editingRef.current;
    fileOperation.current = true;
    notify("Preparando el ejemplo…");
    try {
      const example = await createFaceOperationExample(kind, buildModel);
      if (
        docRef.current !== documentBefore ||
        editingRef.current !== editBefore
      ) {
        notify(
          "La pieza cambió mientras se preparaba el ejemplo. Vuelve a abrirlo desde la biblioteca.",
        );
        return;
      }
      reset(example);
      notify("Ejemplo preparado.");
    } catch (err) {
      notify((err as Error).message, true);
    } finally {
      fileOperation.current = false;
    }
  };
  const loadExtrudeDemo = async (kind: ExtrudeExampleKind) => {
    if (!(await canReplace())) return;
    const documentBefore = docRef.current;
    const editBefore = editingRef.current;
    fileOperation.current = true;
    notify("Preparando el ejemplo…");
    try {
      const example = await createExtrudeEndExample(kind, buildModel);
      if (
        docRef.current !== documentBefore ||
        editingRef.current !== editBefore
      ) {
        notify(
          "La pieza cambió mientras se preparaba el ejemplo. Vuelve a abrirlo desde la biblioteca.",
        );
        return;
      }
      reset(example);
      notify("Ejemplo preparado.");
    } catch (err) {
      notify((err as Error).message, true);
    } finally {
      fileOperation.current = false;
    }
  };
  const loadHoleDemo = async (kind: HoleExampleKind) => {
    if (!(await canReplace())) return;
    const documentBefore = docRef.current;
    const editBefore = editingRef.current;
    fileOperation.current = true;
    notify("Preparando el ejemplo…");
    try {
      const example = await createHoleExample(kind, buildModel);
      if (
        docRef.current !== documentBefore ||
        editingRef.current !== editBefore
      ) {
        notify(
          "La pieza cambió mientras se preparaba el ejemplo. Vuelve a abrirlo desde la biblioteca.",
        );
        return;
      }
      reset(example);
      notify("Ejemplo preparado.");
    } catch (err) {
      notify((err as Error).message, true);
    } finally {
      fileOperation.current = false;
    }
  };
  const saveDoc = async (saveAs = false) => {
    if (!requireFinishedEdit()) return;
    if (fileOperation.current) {
      notify("Espera a que termine la operación de archivo actual.");
      return;
    }
    fileOperation.current = true;
    const snapshot = serializeDocument(doc);
    try {
      if (window.solidflow) {
        const path = await window.solidflow.saveDocument(
          snapshot,
          doc.name,
          saveAs ? undefined : filePath,
        );
        if (!path) return;
        if (docRef.current.id === doc.id) setFilePath(path);
      } else
        download(
          new Blob([snapshot], { type: "application/json" }),
          doc.name + ".solidflow",
        );
      if (docRef.current.id === doc.id) setSaved(snapshot);
      notify("Pieza guardada");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      fileOperation.current = false;
    }
  };
  const openDoc = async () => {
    if (!(await canReplace())) return;
    fileOperation.current = true;
    try {
      if (window.solidflow) {
        const file = await window.solidflow.openDocument();
        if (file) reset(parseDocument(file.content), file.path, true);
      } else fileInput.current?.click();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      fileOperation.current = false;
    }
  };
  const exportFile = async (format: "step" | "stl") => {
    if (!requireFinishedEdit()) return;
    if (!canExport) return;
    if (fileOperation.current) {
      notify("Espera a que termine la operación de archivo actual.");
      return;
    }
    fileOperation.current = true;
    setExporting(true);
    try {
      const blob = await exportCad(format, doc.features);
      if (window.solidflow) {
        const path = await window.solidflow.exportDocument(
          new Uint8Array(await blob.arrayBuffer()),
          doc.name,
          format,
        );
        if (!path) return;
      } else download(blob, doc.name + "." + format);
      notify(`Geometría exportada en ${format.toUpperCase()}`);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      fileOperation.current = false;
      setExporting(false);
    }
  };
  const undo = () => {
      if (editing?.type === "sketch") {
        const previous = sketchPast.at(-1);
        if (!previous) return;
        setSketchFuture((old) => [...old, structuredClone(editing)]);
        setSketchPast((old) => old.slice(0, -1));
        setEditing(structuredClone(previous));
        setSketchSelection([]);
        setPickingSupport(false);
        setFaceSelection(null);
        setError("");
        return;
      }
      if (!requireFinishedEdit()) return;
      setDoc(history.current!.undo());
      setSelected(null);
      setError("");
    },
    redo = () => {
      if (editing?.type === "sketch") {
        const next = sketchFuture.at(-1);
        if (!next) return;
        setSketchPast((old) => [...old, structuredClone(editing)]);
        setSketchFuture((old) => old.slice(0, -1));
        setEditing(structuredClone(next));
        setSketchSelection([]);
        setPickingSupport(false);
        setFaceSelection(null);
        setError("");
        return;
      }
      if (!requireFinishedEdit()) return;
      setDoc(history.current!.redo());
      setSelected(null);
      setError("");
    };
  const startSketch = (kind: SketchTool = "rectangle") => {
    if (!requireFinishedEdit()) return;
    if (faceSelection && (busy || !previewCurrent)) {
      notify("Espera a que se reconstruya la pieza antes de usar esta cara.");
      return;
    }
    if (faceSelection && !faceSelection.frame) {
      notify("Selecciona una cara plana para crear un croquis.", true);
      return;
    }
    const support = selectedSupport();
    setSelectionMode("body");
    setEdgeSelection([]);
    setFaceSelection(null);
    setPickingSupport(false);
    const count = doc.features.filter((f) => f.type === "sketch").length + 1;
    setEditing({
      id: crypto.randomUUID(),
      name: `Croquis${count}`,
      type: "sketch",
      plane,
      ...(support.kind !== "principal" ? { support } : {}),
      offset: 0,
      suppressed: false,
      profile: emptySketch(),
    });
    setSketchSelection([]);
    setSketchPast([]);
    setSketchFuture([]);
    setSketchTool(kind);
    setTab("Croquis");
    setError("");
  };
  const selectedSupport = (): PlaneSupport => {
    const face = model?.faces?.find(
      (candidate) =>
        faceSelection &&
        candidate.ref.key === faceSelection.ref.key &&
        candidate.ref.sourceFeatureId === faceSelection.ref.sourceFeatureId,
    );
    if (face?.frame) return { kind: "face", face: face.ref };
    if (selectedFeature?.type === "plane" && !selectedFeature.suppressed)
      return { kind: "plane", planeId: selectedFeature.id };
    return { kind: "principal", plane };
  };
  const startPlane = () => {
    if (!requireFinishedEdit()) return;
    if (faceSelection && (busy || !previewCurrent)) {
      notify("Espera a que se reconstruya la pieza antes de usar esta cara.");
      return;
    }
    if (faceSelection && !faceSelection.frame) {
      notify("Selecciona una cara plana como referencia.", true);
      return;
    }
    setEditing({
      id: crypto.randomUUID(),
      name: `Plano${doc.features.filter((feature) => feature.type === "plane").length + 1}`,
      type: "plane",
      support: selectedSupport(),
      offset: 10,
      reversed: false,
      suppressed: false,
    });
    setSelectionMode("body");
    setFaceSelection(null);
    setPickingSupport(false);
    setEdgeSelection([]);
    setTab("Operaciones");
    setError("");
  };
  const changeSupport = (support: PlaneSupport) => {
    if (
      editing?.type === "plane" ||
      editing?.type === "mirror" ||
      editing?.type === "draft" ||
      editing?.type === "hole"
    )
      changeDraft({ support });
    else if (editing?.type === "sketch")
      changeDraft(
        support.kind === "principal"
          ? { support: undefined, plane: support.plane }
          : { support },
      );
    setPickingSupport(false);
    if (editing?.type === "draft") setFacePreview(editing.faces.length > 0);
    setFaceSelection(null);
    setError("");
  };
  const changeEndTarget = (target: PlaneSupport) => {
    if (!extrudeEditing || extrudeEditing.endCondition?.kind !== "upToSurface")
      return;
    changeDraft({ endCondition: { kind: "upToSurface", target } });
    setPickingEndFace(false);
    setFaceSelection(null);
    setError("");
  };
  const selectFace = (face: PickableFace | null) => {
    if (
      (pickingMirror ||
        pickingFaceOperation ||
        pickingExtrude ||
        pickingHole) &&
      sourceLoading
    )
      return;
    if (pickingHole) {
      if (
        !face ||
        !sourceModel?.faces?.some((candidate) =>
          sameFace(candidate.ref, face.ref),
        )
      )
        return;
      if (!face.frame) {
        notify(
          "Selecciona una cara plana para colocar los centros del taladro.",
          true,
        );
        return;
      }
      changeSupport({ kind: "face", face: face.ref });
      return;
    }
    if (pickingExtrude) {
      if (
        face &&
        sourceModel?.faces?.some((candidate) =>
          sameFace(candidate.ref, face.ref),
        )
      ) {
        changeEndTarget({ kind: "face", face: face.ref });
      }
      return;
    }
    if (faceEditing && !facePreview && !pickingSupport) {
      if (
        !face ||
        !sourceModel?.faces?.some((candidate) =>
          sameFace(candidate.ref, face.ref),
        )
      )
        return;
      const exists = operationFaces.some((candidate) =>
        sameFace(candidate, face.ref),
      );
      if (!exists && operationFaces.length >= 256) {
        notify("Puedes seleccionar hasta 256 caras en esta operación.", true);
        return;
      }
      const faces = exists
        ? operationFaces.filter((candidate) => !sameFace(candidate, face.ref))
        : [...operationFaces, face.ref];
      changeDraft(
        faceEditing.type === "shell" ? { removedFaces: faces } : { faces },
      );
      return;
    }
    if (busy || !previewCurrent) return;
    if (pickingSupport) {
      if (!face?.frame) {
        if (face)
          notify("Esta cara es curva. Selecciona una cara plana.", true);
        return;
      }
      changeSupport({ kind: "face", face: face.ref });
    } else {
      setFaceSelection(face);
      setSelected(null);
      setEdgeSelection([]);
      if (face && !face.frame)
        notify(
          "Cara curva seleccionada. Los croquis planos requieren una cara plana.",
        );
    }
  };
  const startAdvancedFeature = (type: "sweep" | "loft") => {
    if (!requireFinishedEdit()) return;
    const inputs = doc.features.filter(
      (feature): feature is SketchFeature =>
        feature.type === "sketch" && !feature.suppressed,
    );
    const preferredSketch = inputs.find(
      (sketch) => sketch.id === selectedSketch?.id,
    );
    if (inputs.length < 2) {
      notify(
        type === "sweep"
          ? "Crea dos croquis: un perfil cerrado y una trayectoria abierta."
          : "Crea al menos dos croquis de sección en planos distintos.",
      );
      return;
    }
    const base = {
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((feature) => feature.type === type).length + 1}`,
      suppressed: false,
      merge: true,
    };
    if (type === "sweep") {
      const paths = inputs.flatMap((sketch) => {
        try {
          return [{ sketch, path: resolvedSweepPath(sketch) }];
        } catch {
          return [];
        }
      });
      const selectedPath =
        paths.find(
          (candidate) => candidate.sketch.id === preferredSketch?.id,
        ) ?? paths.at(-1);
      if (!selectedPath) {
        notify(
          "La trayectoria necesita un croquis con una cadena abierta de líneas o arcos.",
          true,
        );
        return;
      }
      const profile =
        preferredSketch && preferredSketch.id !== selectedPath.sketch.id
          ? preferredSketch
          : inputs.find((sketch) => sketch.id !== selectedPath.sketch.id)!;
      setEditing({
        ...base,
        type,
        profileSketchId: profile.id,
        pathSketchId: selectedPath.sketch.id,
        path: selectedPath.path,
        orientation: "followPath",
      });
    } else {
      const sections = inputs.slice(-2);
      if (
        preferredSketch &&
        !sections.some((sketch) => sketch.id === preferredSketch.id)
      )
        sections[0] = preferredSketch;
      setEditing({
        ...base,
        type,
        sections: sections.map(initialLoftSection),
        ruled: false,
      });
    }
    setSelectionMode("body");
    setFaceSelection(null);
    setEdgeSelection([]);
    setPickingSupport(false);
    setTab("Operaciones");
    setError("");
  };
  const startFeature = (type: "extrude" | "cut" | "revolve") => {
    if (!requireFinishedEdit()) return;
    setPickingEndFace(false);
    setPickingSupport(false);
    setSelectionMode("body");
    setEdgeSelection([]);
    setFaceSelection(null);
    const sketch =
      (selectedSketch?.suppressed ? undefined : selectedSketch) ??
      [...doc.features]
        .reverse()
        .find((f) => f.type === "sketch" && !f.suppressed);
    if (!sketch) {
      notify("Crea o selecciona un croquis antes de añadir la operación.");
      return;
    }
    const base = {
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((f) => f.type === type).length + 1}`,
      sketchId: sketch.id,
      suppressed: false,
    };
    setEditing(
      type === "revolve"
        ? { ...base, type, angle: 360 }
        : {
            ...base,
            type,
            depth:
              type === "cut" && sketch.type === "sketch" && sketch.support
                ? -20
                : 20,
            symmetric: false,
          },
    );
    setTab("Operaciones");
    setError("");
  };
  const startRepetition = (type: RepetitionFeature["type"]) => {
    if (!requireFinishedEdit()) return;
    if (!canExport) {
      notify("Reconstruye un sólido válido antes de repetir su geometría.");
      return;
    }
    const sourceId = model?.faces?.[0]?.ref.sourceFeatureId;
    const base = doc.features.find((feature) => feature.id === sourceId);
    if (!base) return;
    const seed =
      selectedFeature &&
      selectedFeature.type !== "sketch" &&
      selectedFeature.type !== "plane" &&
      !selectedFeature.suppressed
        ? selectedFeature
        : base;
    const common = {
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((feature) => feature.type === type).length + 1}`,
      suppressed: false,
      baseFeatureId: base.id,
      source: {
        mode: "features" as const,
        geometryPattern: true as const,
        featureIds: [seed.id],
      },
    };
    if (type === "linearPattern")
      setEditing({
        ...common,
        type,
        first: { direction: [1, 0, 0], spacing: 20, count: 3 },
        second: null,
        secondSeedOnly: false,
        skipped: [],
      });
    else if (type === "circularPattern")
      setEditing({
        ...common,
        type,
        axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
        count: 6,
        angle: 360,
        equalSpacing: true,
        reversed: false,
        skipped: [],
      });
    else
      setEditing({
        ...common,
        type,
        support:
          faceSelection?.frame || selectedFeature?.type === "plane"
            ? selectedSupport()
            : {
                kind: "principal",
                plane:
                  selected && ["XY", "XZ", "YZ"].includes(selected)
                    ? plane
                    : "YZ",
              },
        mergeBodies: false,
      });
    setSelectionMode("body");
    setFaceSelection(null);
    setPickingSupport(false);
    setEdgeSelection([]);
    setTab("Operaciones");
    setError("");
  };
  const startFaceOperation = (type: FaceOperationFeature["type"]) => {
    if (!requireFinishedEdit()) return;
    if (!canExport) {
      notify("Reconstruye un sólido válido antes de aplicar la operación.");
      return;
    }
    const baseFeatureId = model?.faces?.[0]?.ref.sourceFeatureId;
    if (!baseFeatureId) return;
    const faces =
      faceSelection &&
      faceSelection.ref.sourceFeatureId === baseFeatureId &&
      model?.faces?.some((candidate) =>
        sameFace(candidate.ref, faceSelection.ref),
      )
        ? [faceSelection.ref]
        : [];
    const common = {
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((feature) => feature.type === type).length + 1}`,
      suppressed: false,
      baseFeatureId,
    };
    setEditing(
      type === "shell"
        ? {
            ...common,
            type,
            thickness: 2,
            direction: "inward",
            removedFaces: faces,
          }
        : {
            ...common,
            type,
            angle: 5,
            reversed: false,
            support:
              selectedFeature?.type === "plane"
                ? { kind: "plane", planeId: selectedFeature.id }
                : { kind: "principal", plane },
            faces,
            propagation: "tangent",
          },
    );
    setFacePreview(false);
    setSelectionMode("body");
    setFaceSelection(null);
    setPickingSupport(false);
    setEdgeSelection([]);
    setSelected(null);
    setTab("Operaciones");
    setError("");
  };
  const startHole = () => {
    if (!requireFinishedEdit()) return;
    if (!canExport) {
      notify("Reconstruye un sólido válido antes de crear taladros.");
      return;
    }
    const baseFeatureId = model?.faces?.[0]?.ref.sourceFeatureId;
    if (!baseFeatureId) return;
    const selectedFace =
      faceSelection?.frame &&
      model?.faces?.some((face) => sameFace(face.ref, faceSelection.ref))
        ? faceSelection
        : null;
    const chosenPlane =
      selectedFeature?.type === "plane" &&
      !selectedFeature.suppressed &&
      model?.planes?.some((item) => item.id === selectedFeature.id)
        ? selectedFeature
        : null;
    const support: PlaneSupport = selectedFace
      ? { kind: "face", face: selectedFace.ref }
      : chosenPlane
        ? { kind: "plane", planeId: chosenPlane.id }
        : { kind: "principal", plane };
    const feature: HoleFeature = {
      id: crypto.randomUUID(),
      name: `Taladro${doc.features.filter((item) => item.type === "hole").length + 1}`,
      type: "hole",
      suppressed: false,
      baseFeatureId,
      support,
      positions: [],
      reversed: false,
      diameter: 8,
      endCondition: { kind: "throughAll" },
      head: { kind: "simple" },
    };
    setEditing(feature);
    setHoleSection("positions");
    setSelectedHolePosition(null);
    setPickingSupport(!selectedFace && !chosenPlane);
    setPickingEndFace(false);
    setSelectionMode("body");
    setFaceSelection(null);
    setEdgeSelection([]);
    setSelected(null);
    setTab("Operaciones");
    setError("");
  };
  const startFinish = (type: "fillet" | "chamfer") => {
    if (!requireFinishedEdit()) return;
    if (!canExport) {
      notify("Reconstruye un sólido válido antes de aplicar el acabado.");
      return;
    }
    const sourceId = model?.edges[0]?.ref.sourceFeatureId;
    const base =
      doc.features.find((feature) => feature.id === sourceId) ??
      [...doc.features]
        .reverse()
        .find(
          (feature) =>
            feature.type !== "sketch" &&
            feature.type !== "plane" &&
            !feature.suppressed,
        );
    if (!base) return;
    const edges = edgeSelection.filter(
      (edge) =>
        edge.sourceFeatureId === base.id &&
        model?.edges.some((candidate) => sameEdge(candidate.ref, edge)),
    );
    setEditing({
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((feature) => feature.type === type).length + 1}`,
      type,
      size: 1,
      baseFeatureId: base.id,
      selection: { mode: "selected", edges },
      suppressed: false,
    });
    setFinishPreview(false);
    setSelectionMode("body");
    setSelected(null);
    setTab("Operaciones");
    setError("");
  };
  const toggleEdge = (edge: EdgeReference) => {
    const toggle = (edges: EdgeReference[]) =>
      edges.some((candidate) => sameEdge(candidate, edge))
        ? edges.filter((candidate) => !sameEdge(candidate, edge))
        : [...edges, edge];
    if (finishEditing) {
      if (
        sourceLoading ||
        !sourceModel?.edges.some((candidate) => sameEdge(candidate.ref, edge))
      )
        return;
      const current =
        finishEditing.selection.mode === "selected"
          ? finishEditing.selection.edges
          : (sourceModel?.edges ?? []).map((candidate) => candidate.ref);
      setEditing({
        ...finishEditing,
        selection: { mode: "selected", edges: toggle(current) },
      });
      setError("");
      setFinishPreview(false);
    } else {
      if (busy || !previewCurrent) return;
      setEdgeSelection(toggle);
      setSelected(null);
    }
  };
  const applySketchChamfer = (plan: ChamferPlan) => {
    if (
      editing?.type !== "sketch" ||
      !plan.changed ||
      !plan.chamferEntityId ||
      plan.sourceProfile !== sketchSolution?.profile
    ) {
      notify("El croquis ha cambiado. Revisa la vista previa del chaflán.", true);
      return;
    }
    // Validate the same planned profile through the normal editing solver once.
    // A failed solve must not replace the current sketch or enter undo history.
    const result = solveSketch(plan.profile);
    if (!["underdefined", "fullyDefined"].includes(result.status)) {
      notify(`No se puede aplicar el chaflán: ${result.message}`, true);
      return;
    }
    changeDraft({ profile: result.profile });
    setSketchTool("select");
    setChamferPreview(null);
    setSketchSelection([{ kind: "entity", id: plan.chamferEntityId }]);
    notify("Chaflán aplicado. Sus cotas se pueden editar en el croquis.");
  };
  const applySketchFillet = (plan: FilletPlan) => {
    if (editing?.type !== "sketch" || !plan.changed || !plan.filletEntityId ||
      plan.sourceProfile !== sketchSolution?.profile) {
      notify("El croquis ha cambiado. Revisa la vista previa del redondeo.", true);
      return;
    }
    const result = solveSketch(plan.profile);
    if (!["underdefined", "fullyDefined"].includes(result.status)) {
      notify(`No se puede aplicar el redondeo: ${result.message}`, true);
      return;
    }
    changeDraft({ profile: result.profile });
    setFilletPreview(null);
    filletSessionIds.current = [...filletSessionIds.current.filter(id => id !== plan.filletEntityId), plan.filletEntityId];
    setPreviousFilletId(plan.filletEntityId);
    setSketchSelection([]);
    notify("Redondeo aplicado. Selecciona otra esquina o termina con Esc.");
  };
  const acceptEdit = () => {
    if (!editing || !canAccept) return;
    if (editing.type === "sketch" && sketchTool === "chamfer") {
      if (chamferPreview) applySketchChamfer(chamferPreview);
      return;
    }
    if (editing.type === "sketch" && sketchTool === "fillet") {
      if (filletPreview) applySketchFillet(filletPreview);
      return;
    }
    try {
      const next = doc.features.some((f) => f.id === editing.id)
        ? updateFeature(
            doc,
            editing.id,
            editing.type === "sketch"
              ? { ...editing, support: editing.support }
              : editing,
          )
        : addFeature(doc, editing);
      apply(next);
      setSelected(editing.id);
      setEditing(null);
      setPickingSupport(false);
      setPickingEndFace(false);
      setFaceSelection(null);
      setEdgeSelection([]);
      setSelectionMode("body");
      setTab("Operaciones");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const cancelEdit = () => {
    setPickingEndFace(false);
    setEditing(null);
    setPickingSupport(false);
    setFaceSelection(null);
    setEdgeSelection([]);
    setSelectionMode("body");
    setError("");
    setTab("Operaciones");
  };
  const changeDraft = (patch: Partial<Feature>) => {
    if (!editing) return;
    const next = { ...editing, ...patch } as Feature;
    if (JSON.stringify(next) === JSON.stringify(editing)) return;
    if (editing.type === "sketch") {
      setSketchPast((old) => [...old, structuredClone(editing)].slice(-100));
      setSketchFuture([]);
    }
    setError("");
    setEditing(next);
  };
  const cancelActiveEdit = () => {
    if (editing?.type === "sketch" && (sketchTool === "chamfer" || sketchTool === "fillet")) {
      setSketchTool("select");
      setSketchSelection([]);
      setChamferPreview(null);
      setFilletPreview(null);
      setPreviousFilletId(null);
      filletSessionIds.current = [];
    } else cancelEdit();
  };
  const changeEntityProfile = (candidate: EntityProfile) => {
    if (editing?.type !== "sketch") return;
    if (
      entityProfile &&
      JSON.stringify(candidate) === JSON.stringify(entityProfile)
    )
      return;
    try {
      candidate = validateEntityProfile(candidate);
    } catch (err) {
      notify((err as Error).message, true);
      return;
    }
    const result = solveSketch(candidate);
    changeDraft({
      profile: ["underdefined", "fullyDefined"].includes(result.status)
        ? result.profile
        : candidate,
    });
  };
  const selectSketchTool = (tool: SketchTool) => {
    if (editing?.type !== "sketch") {
      startSketch(tool);
      return;
    }
    if (
      editing.profile.kind !== "entities" &&
      (tool === "line" ||
        tool === "arc" ||
        tool === "trim" ||
        tool === "extend" ||
        tool === "chamfer")
    )
      changeEntityProfile(convertProfile(editing.profile));
    setSketchTool(tool);
    if (tool === "fillet") {
      filletSessionIds.current = [];
      setPreviousFilletId(null);
    }
    if (tool !== "chamfer" && tool !== "fillet") setSketchSelection([]);
  };
  const changeProfile = (patch: Partial<LegacyProfile>) => {
    if (editing?.type === "sketch" && editing.profile.kind !== "entities")
      changeDraft({
        profile: { ...editing.profile, ...patch } as LegacyProfile,
      });
  };
  const deleteSelected = () => {
    if (entityProfile) {
      changeEntityProfile(removeSelection(entityProfile, sketchSelection));
      setSketchSelection([]);
      return;
    }
    if (!requireFinishedEdit() || !selectedFeature) return;
    try {
      apply(removeFeature(doc, selectedFeature.id));
      setSelected(null);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const input =
        e.target instanceof HTMLElement &&
        !!e.target.closest("input,textarea,select,[contenteditable='true']");
      if (showHelp || rename || discardDecision.current) {
        if (e.key === "Escape") {
          if (discardDecision.current) finishDiscard(false);
          else {
            setShowHelp(false);
            setRename(false);
          }
          e.preventDefault();
        }
        if (
          (e.ctrlKey || e.metaKey) &&
          ["n", "o", "s"].includes(e.key.toLowerCase())
        )
          e.preventDefault();
        return;
      }
      if (
        e.key === "Escape" &&
        editing?.type === "sketch" &&
        (sketchTool === "chamfer" || sketchTool === "fillet")
      ) {
        e.preventDefault();
        cancelActiveEdit();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (input && (key === "z" || key === "y")) return;
        if (["s", "o", "n", "z", "y"].includes(key)) {
          e.preventDefault();
          if (key === "s") void saveDoc(e.shiftKey);
          if (key === "o") void openDoc();
          if (key === "n") newDoc();
          if (key === "z") e.shiftKey ? redo() : undo();
          if (key === "y") redo();
        }
        const views: Record<string, ViewName> = {
          "1": "front",
          "2": "back",
          "3": "left",
          "4": "right",
          "5": "top",
          "6": "bottom",
          "7": "iso",
        };
        if (views[key]) {
          e.preventDefault();
          changeView(views[key]);
        }
      } else if (!input) {
        if (e.key === "Escape") {
          if (entityProfile) {
            setSketchTool("select");
            setSketchSelection([]);
          } else cancelEdit();
          setMenu(null);
        }
        if (e.key.toLowerCase() === "f") changeView("fit");
        if (e.key === "Delete") deleteSelected();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  const profile: Profile =
    editing?.type === "sketch"
      ? (filletConvertedProfile ?? editing.profile)
      : { kind: "rectangle", center: [0, 0], width: 60, height: 40 };
  const editingSupport: PlaneSupport | null =
    editing?.type === "plane" ||
    editing?.type === "mirror" ||
    editing?.type === "draft" ||
    editing?.type === "hole"
      ? editing.support
      : editing?.type === "sketch"
        ? (editing.support ?? { kind: "principal", plane: editing.plane })
        : null;
  const editingIndex = editing
    ? doc.features.findIndex((feature) => feature.id === editing.id)
    : -1;
  const availablePlanes = doc.features
    .slice(0, editingIndex < 0 ? doc.features.length : editingIndex)
    .filter(
      (feature): feature is ReferencePlaneFeature => feature.type === "plane",
    );
  const availableFeatures = doc.features.slice(
    0,
    editingIndex < 0 ? doc.features.length : editingIndex,
  );
  const preferredEndPlane = availablePlanes
    .filter(
      (reference) =>
        !reference.suppressed &&
        sourceModel?.planes?.some((plane) => plane.id === reference.id),
    )
    .at(-1);
  const selectedPlaneId =
    editing?.type === "plane"
      ? editing.id
      : selectedFeature?.type === "plane"
        ? selectedFeature.id
        : undefined;
  const hasVisiblePlane = visibleModel?.planes?.some(
    (reference) => showPlanes || reference.id === selectedPlaneId,
  );
  const sketchPlaneLabel = editingSupport
    ? supportLabel(editingSupport, doc.features)
    : planeNames[plane];
  const sketchPlaneShortLabel =
    editingSupport?.kind === "face" ? "Cara plana" : sketchPlaneLabel;
  const referenceLines = useMemo(() => {
    if (editing?.type !== "sketch" || !editing.support) return undefined;
    const frame = model?.sketches?.find(
      (sketch) => sketch.id === editing.id,
    )?.frame;
    if (!frame || !model?.edgeLines.length) return undefined;
    const [nx, ny, nz] = frame.normal,
      [ux, uy, uz] = frame.xDirection;
    const v = [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux];
    const projected: number[] = [];
    for (let index = 0; index < model.edgeLines.length; index += 3) {
      const delta = model.edgeLines
        .slice(index, index + 3)
        .map((value, axis) => value - frame.origin[axis]);
      projected.push(
        delta.reduce(
          (sum, value, axis) => sum + value * frame.xDirection[axis],
          0,
        ),
        delta.reduce((sum, value, axis) => sum + value * v[axis], 0),
      );
    }
    return projected;
  }, [editing, model]);
  const holeFrame = useMemo((): PlaneFrame | undefined => {
    if (!holeEditing) return undefined;
    const support = holeEditing.support;
    if (support.kind === "principal") return principalPlaneFrame(support.plane);
    if (support.kind === "plane")
      return sourceModel?.planes?.find((item) => item.id === support.planeId)
        ?.frame;
    const currentFace = sourceModel?.faces?.find((face) =>
      sameFace(face.ref, support.face),
    );
    if (currentFace?.frame) return currentFace.frame;
    const builtHole = builtFeatures?.find((item) => item.id === holeEditing.id);
    if (
      builtHole?.type === "hole" &&
      JSON.stringify(builtHole.support) === JSON.stringify(support)
    )
      return model?.holes?.find((item) => item.id === holeEditing.id)?.frame;
    return undefined;
  }, [holeEditing, sourceModel, model, builtFeatures]);
  const holeReferenceLines = useMemo(() => {
    if (!holeFrame || !sourceModel) return undefined;
    const y = frameYDirection(holeFrame),
      projected: number[] = [];
    for (let index = 0; index + 2 < sourceModel.edgeLines.length; index += 3) {
      const delta = sourceModel.edgeLines
        .slice(index, index + 3)
        .map((value, axis) => value - holeFrame.origin[axis]) as Vec3;
      projected.push(frameDot(delta, holeFrame.xDirection), frameDot(delta, y));
    }
    return projected;
  }, [holeFrame, sourceModel]);
  const sketches = doc.features.filter(
    (f): f is SketchFeature => f.type === "sketch",
  );
  const availableSketches = doc.features
    .slice(0, editingIndex < 0 ? doc.features.length : editingIndex)
    .filter((feature): feature is SketchFeature => feature.type === "sketch");
  const consumedSketches = new Set(
    effectiveFeatures
      .filter((feature) => !feature.suppressed)
      .flatMap(featureSketchIds),
  );
  const selectedSketchId =
    selectedFeature?.type === "sketch" ? selectedFeature.id : undefined;
  const visibleSketchIds = sketches
    .filter(
      (sketch) =>
        !sketch.suppressed &&
        (!visibleModel?.vertices.length ||
          !consumedSketches.has(sketch.id) ||
          sketch.id === selectedSketchId),
    )
    .map((sketch) => sketch.id);
  const hasVisibleSketch = visibleModel?.sketches?.some(
    (sketch) =>
      visibleSketchIds.includes(sketch.id) &&
      (sketch.lines.length || sketch.constructionLines.length),
  );
  const consumed = new Set(doc.features.flatMap(featureSketchIds));
  const row = (feature: Feature, nested = false) => {
    const Icon = featureIcons[feature.type];
    const failed = model?.featureErrors.some((e) => e.id === feature.id);
    return (
      <div
        key={feature.id}
        className={`tree-row ${nested ? "nested" : ""} ${selected === feature.id ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""}`}
        onClick={() => {
          setSelected(feature.id);
          setFaceSelection(null);
        }}
        onDoubleClick={() => editFeature(feature)}
        title="Doble clic para editar"
      >
        <ChevronRight
          size={11}
          className={
            feature.type === "sketch" || feature.type === "plane"
              ? "invisible"
              : ""
          }
        />
        <Icon size={16} />
        <span>{feature.name}</span>
        {failed && <AlertTriangle size={13} className="error-icon" />}
        {feature.suppressed && <Eye size={12} />}
      </div>
    );
  };
  return (
    <div
      className="app-shell"
      onClick={() => {
        if (menu) setMenu(null);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".solidflow"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f)
            try {
              reset(parseDocument(await f.text()), undefined, true);
            } catch (err) {
              notify((err as Error).message, true);
            }
          e.target.value = "";
        }}
      />
      <header className="menubar">
        <div className="brand">
          <div className="brand-mark">
            S<span>F</span>
          </div>
          <strong>
            Solid<span>Flow</span>
          </strong>
        </div>
        <nav>
          {[
            "Archivo",
            "Editar",
            "Ver",
            "Insertar",
            "Herramientas",
            "Ayuda",
          ].map((name) => (
            <div className="menu-wrap" key={name}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(menu === name ? null : name);
                }}
                className={menu === name ? "active" : ""}
              >
                {name}
              </button>
              {menu === name && (
                <div className="dropdown" onClick={(e) => e.stopPropagation()}>
                  {(name === "Archivo"
                    ? [
                        ["Nueva pieza", "Ctrl+N", newDoc],
                        ["Abrir…", "Ctrl+O", openDoc],
                        ["Guardar", "Ctrl+S", () => saveDoc()],
                        ["Guardar como…", "Ctrl+Mayús+S", () => saveDoc(true)],
                        ["Exportar STEP", "", () => exportFile("step")],
                        ["Exportar STL", "", () => exportFile("stl")],
                        ["Abrir pieza de ejemplo", "", loadDemo],
                      ]
                    : name === "Editar"
                      ? [
                          ["Deshacer", "Ctrl+Z", undo],
                          ["Rehacer", "Ctrl+Y", redo],
                          [
                            "Editar operación",
                            "",
                            () =>
                              selectedFeature && editFeature(selectedFeature),
                          ],
                          ["Eliminar operación", "Supr", deleteSelected],
                          [
                            "Cambiar nombre de pieza",
                            "",
                            () => {
                              if (requireFinishedEdit()) setRename(true);
                            },
                          ],
                        ]
                      : name === "Ver"
                        ? [
                            ["Isométrica", "Ctrl+7", () => changeView("iso")],
                            ["Frontal", "Ctrl+1", () => changeView("front")],
                            ["Superior", "Ctrl+5", () => changeView("top")],
                            [
                              "Ajustar a pantalla",
                              "F",
                              () => changeView("fit"),
                            ],
                            ["Cuadrícula", "", () => setGrid(!grid)],
                            [
                              "Planos de referencia",
                              "",
                              () => setShowPlanes(!showPlanes),
                            ],
                          ]
                        : name === "Insertar"
                          ? [
                              ["Croquis rectangular", "", () => startSketch()],
                              [
                                "Croquis circular",
                                "",
                                () => startSketch("circle"),
                              ],
                              [
                                "Saliente extruido",
                                "",
                                () => startFeature("extrude"),
                              ],
                              ["Corte extruido", "", () => startFeature("cut")],
                              ["Asistente para taladro", "", startHole],
                              ["Revolución", "", () => startFeature("revolve")],
                              [
                                "Barrido",
                                "",
                                () => startAdvancedFeature("sweep"),
                              ],
                              [
                                "Recubrir",
                                "",
                                () => startAdvancedFeature("loft"),
                              ],
                              ["Redondeo", "", () => startFinish("fillet")],
                              ["Chaflán", "", () => startFinish("chamfer")],
                              [
                                "Vaciado",
                                "",
                                () => startFaceOperation("shell"),
                              ],
                              [
                                "Desmoldeo",
                                "",
                                () => startFaceOperation("draft"),
                              ],
                              ["Plano de referencia", "", startPlane],
                              [
                                "Matriz lineal",
                                "",
                                () => startRepetition("linearPattern"),
                              ],
                              [
                                "Matriz circular",
                                "",
                                () => startRepetition("circularPattern"),
                              ],
                              ["Simetría", "", () => startRepetition("mirror")],
                            ]
                          : name === "Herramientas"
                            ? [
                                [
                                  "Propiedades físicas",
                                  "",
                                  () => setPanel("properties"),
                                ],
                                [
                                  "Reconstruir",
                                  "",
                                  () =>
                                    setDoc({
                                      ...doc,
                                      features: [...doc.features],
                                    }),
                                ],
                              ]
                            : [
                                ["Ayuda y atajos", "", () => setShowHelp(true)],
                                ["Pieza de ejemplo", "", loadDemo],
                              ]
                  ).map(([label, shortcut, action]) => (
                    <button
                      key={String(label)}
                      onClick={() => {
                        (action as () => void)();
                        setMenu(null);
                      }}
                    >
                      <span>{String(label)}</span>
                      <kbd>{String(shortcut)}</kbd>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="document-title">
          {doc.name}
          {dirty ? " *" : ""} — SolidFlow
        </div>
        <button
          className="help-top"
          onClick={() => setShowHelp(true)}
          title="Ayuda"
        >
          <HelpCircle size={17} />
        </button>
      </header>
      <div className="quickbar">
        <div className="quick-actions">
          <IconButton
            icon={FilePlus2}
            title="Nueva pieza (Ctrl+N)"
            onClick={newDoc}
          />
          <IconButton
            icon={FolderOpen}
            title="Abrir (Ctrl+O)"
            onClick={() => void openDoc()}
          />
          <IconButton
            icon={Save}
            title="Guardar (Ctrl+S)"
            onClick={() => void saveDoc()}
          />
          <i />
          <IconButton
            icon={Undo2}
            title="Deshacer (Ctrl+Z)"
            onClick={undo}
            disabled={
              editing?.type === "sketch"
                ? !sketchPast.length
                : !!editing || !history.current.canUndo
            }
          />
          <IconButton
            icon={Redo2}
            title="Rehacer (Ctrl+Y)"
            onClick={redo}
            disabled={
              editing?.type === "sketch"
                ? !sketchFuture.length
                : !!editing || !history.current.canRedo
            }
          />
          <i />
          <IconButton
            icon={RotateCw}
            title="Reconstruir pieza"
            onClick={() => setDoc({ ...doc, features: [...doc.features] })}
          />
        </div>
        <div className="command-search">
          <Search size={14} />
          <input
            placeholder="Buscar en el árbol…"
            aria-label="Buscar en el árbol"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌕</kbd>
        </div>
        <div className="workspace-tag">
          <Box size={13} /> Pieza <ChevronDown size={11} />
        </div>
      </div>
      <section className="command-manager">
        <div className="commands">
          {tab === "Operaciones" ? (
            <>
              <div className="command-group">
                <Command
                  icon={Box}
                  label="Saliente/Base extruido"
                  large
                  onClick={() => startFeature("extrude")}
                  disabled={!!editing}
                />
                <Command
                  icon={RotateCw}
                  label="Revolución"
                  large
                  onClick={() => startFeature("revolve")}
                  disabled={!!editing}
                />
                <div className="command-stack">
                  <Command
                    icon={MoveUpRight}
                    label="Barrido"
                    onClick={() => startAdvancedFeature("sweep")}
                    disabled={!!editing}
                  />
                  <Command
                    icon={Layers}
                    label="Recubrir"
                    onClick={() => startAdvancedFeature("loft")}
                    disabled={!!editing}
                  />
                </div>
              </div>
              <div className="command-group">
                <Command
                  icon={Scissors}
                  label="Corte extruido"
                  large
                  onClick={() => startFeature("cut")}
                  disabled={!!editing || !model?.vertices.length}
                />
                <Command
                  icon={Crosshair}
                  label="Asistente para taladro"
                  large
                  disabled={!canExport}
                  onClick={startHole}
                />
              </div>
              <div className="command-group">
                <Command
                  icon={CornerDownRight}
                  label="Redondeo"
                  large
                  onClick={() => startFinish("fillet")}
                  disabled={!canExport}
                />
                <Command
                  icon={Triangle}
                  label="Chaflán"
                  large
                  onClick={() => startFinish("chamfer")}
                  disabled={!canExport}
                />
                <div className="command-stack">
                  <Command
                    icon={BoxSelect}
                    label="Vaciado"
                    disabled={!canExport}
                    onClick={() => startFaceOperation("shell")}
                  />
                  <Command
                    icon={Cone}
                    label="Desmoldeo"
                    disabled={!canExport}
                    onClick={() => startFaceOperation("draft")}
                  />
                </div>
                <div className="command-stack">
                  <Command
                    icon={Grid3X3}
                    label="Matriz lineal"
                    disabled={!!editing || !canExport}
                    onClick={() => startRepetition("linearPattern")}
                  />
                  <Command
                    icon={RotateCw}
                    label="Matriz circular"
                    disabled={!!editing || !canExport}
                    onClick={() => startRepetition("circularPattern")}
                  />
                  <Command
                    icon={Component}
                    label="Simetría"
                    disabled={!!editing || !canExport}
                    onClick={() => startRepetition("mirror")}
                  />
                </div>
              </div>
              <div className="command-group">
                <Command
                  icon={Pencil}
                  label="Croquis"
                  large
                  onClick={() => startSketch()}
                  disabled={!!editing}
                />
                <Command
                  icon={Layers}
                  label="Geometría de referencia"
                  large
                  onClick={startPlane}
                  disabled={!!editing}
                />
              </div>
            </>
          ) : tab === "Croquis" ? (
            <>
              <div className="command-group">
                <Command
                  icon={editing?.type === "sketch" ? Check : Pencil}
                  label={
                    editing?.type === "sketch"
                      ? sketchTool === "chamfer"
                        ? "Aplicar chaflán"
                        : sketchTool === "fillet"
                        ? "Aplicar redondeo"
                        : "Salir del croquis"
                      : "Nuevo croquis"
                  }
                  large
                  onClick={
                    editing?.type === "sketch"
                      ? acceptEdit
                      : () => startSketch()
                  }
                  active={editing?.type === "sketch"}
                  disabled={editing?.type === "sketch" ? !canAccept : !!editing}
                />
                <Command
                  icon={Ruler}
                  label="Cota inteligente"
                  large
                  onClick={() => {
                    setSketchTool("select");
                    setSketchInspector({
                      name: "dimensions",
                      stamp: Date.now(),
                    });
                  }}
                  disabled={!entityProfile}
                />
              </div>
              <div className="command-group">
                <Command
                  icon={MousePointer2}
                  label="Seleccionar"
                  large
                  onClick={() => selectSketchTool("select")}
                  active={sketchTool === "select"}
                />
                <Command
                  icon={Minus}
                  label="Línea"
                  large
                  onClick={() => selectSketchTool("line")}
                  active={sketchTool === "line"}
                  disabled={!!editing && editing.type !== "sketch"}
                />
                <Command
                  icon={Square}
                  label="Rectángulo"
                  large
                  onClick={() => {
                    if (
                      editing?.type === "sketch" &&
                      editing.profile.kind !== "entities"
                    ) {
                      changeDraft({
                        profile: {
                          kind: "rectangle",
                          center: editing.profile.center,
                          width: 60,
                          height: 40,
                        },
                      });
                      setSketchTool("rectangle");
                    } else selectSketchTool("rectangle");
                  }}
                  active={sketchTool === "rectangle"}
                />
                <Command
                  icon={Circle}
                  label="Círculo"
                  large
                  onClick={() => {
                    if (
                      editing?.type === "sketch" &&
                      editing.profile.kind !== "entities"
                    ) {
                      changeDraft({
                        profile: {
                          kind: "circle",
                          center: editing.profile.center,
                          radius: 15,
                        },
                      });
                      setSketchTool("circle");
                    } else selectSketchTool("circle");
                  }}
                  active={sketchTool === "circle"}
                />
                <Command
                  icon={Spline}
                  label="Arco de centro"
                  large
                  onClick={() => selectSketchTool("arc")}
                  active={sketchTool === "arc"}
                  disabled={!!editing && editing.type !== "sketch"}
                />
              </div>
              <div className="command-group">
                <Command
                  icon={Scissors}
                  label="Recortar entidades"
                  large
                  onClick={() => selectSketchTool("trim")}
                  active={sketchTool === "trim"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={ArrowRightToLine}
                  label="Extender entidades"
                  large
                  onClick={() => selectSketchTool("extend")}
                  active={sketchTool === "extend"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={Triangle}
                  label="Chaflán de croquis"
                  large
                  onClick={() => selectSketchTool("chamfer")}
                  active={sketchTool === "chamfer"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={CornerDownRight}
                  label="Redondeo de croquis"
                  large
                  onClick={() => selectSketchTool("fillet")}
                  active={sketchTool === "fillet"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={Component}
                  label="Relaciones de croquis"
                  large
                  disabled={!entityProfile}
                  onClick={() => {
                    setSketchTool("select");
                    setSketchInspector({
                      name: "relations",
                      stamp: Date.now(),
                    });
                  }}
                />
              </div>
            </>
          ) : tab === "Evaluar" ? (
            <>
              <div className="command-group">
                <Command
                  icon={Ruler}
                  label="Propiedades físicas"
                  large
                  onClick={() => setPanel("properties")}
                />
                <Command
                  icon={Box}
                  label="Envolvente"
                  large
                  onClick={() => setPanel("properties")}
                />
              </div>
              <div className="command-group">
                <Command
                  icon={Download}
                  label="Exportar STEP"
                  large
                  onClick={() => void exportFile("step")}
                  disabled={!canExport}
                />
                <Command
                  icon={Download}
                  label="Exportar STL"
                  large
                  onClick={() => void exportFile("stl")}
                  disabled={!canExport}
                />
              </div>
            </>
          ) : (
            <>
              <div className="command-group">
                <Command
                  icon={Box}
                  label="Isométrica"
                  large
                  onClick={() => changeView("iso")}
                />
                <Command
                  icon={Square}
                  label="Frontal"
                  large
                  onClick={() => changeView("front")}
                />
                <Command
                  icon={Layers}
                  label="Superior"
                  large
                  onClick={() => changeView("top")}
                />
                <Command
                  icon={Maximize}
                  label="Ajustar vista"
                  large
                  onClick={() => changeView("fit")}
                />
              </div>
              <div className="command-group">
                <Command
                  icon={Grid3X3}
                  label="Cuadrícula"
                  large
                  active={grid}
                  onClick={() => setGrid(!grid)}
                />
                <Command
                  icon={Eye}
                  label="Aristas visibles"
                  large
                  active={display === "edges"}
                  onClick={() =>
                    setDisplay(display === "edges" ? "shaded" : "edges")
                  }
                />
              </div>
            </>
          )}
          <div className="ribbon-end">
            <span>DISEÑO PARAMÉTRICO</span>
            <small>Espacio de trabajo de piezas</small>
          </div>
        </div>
        <div className="ribbon-tabs">
          {["Operaciones", "Croquis", "Evaluar", "Vistas"].map((name) => (
            <button
              key={name}
              className={tab === name ? "selected" : ""}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
          <button disabled title="Módulo pendiente">
            Superficies
          </button>
          <button disabled title="Módulo pendiente">
            Chapa metálica
          </button>
          <button disabled title="Módulo pendiente">
            Ensamblaje
          </button>
          <div />
          <button
            className="ribbon-collapse"
            onClick={() => setShowHelp(true)}
            title="Ayuda del espacio de trabajo"
          >
            <HelpCircle size={13} />
          </button>
        </div>
      </section>
      <main className="workspace">
        <aside className="manager">
          <div className="manager-tabs">
            <button
              className={!editing ? "active" : ""}
              onClick={() => {
                requireFinishedEdit();
              }}
              title="Árbol de operaciones"
            >
              <Layers size={17} />
            </button>
            <button
              className={editing ? "active" : ""}
              onClick={() => selectedFeature && editFeature(selectedFeature)}
              title="Propiedades"
            >
              <SlidersHorizontal size={17} />
            </button>
            <button
              onClick={() => setPanel("properties")}
              title="Propiedades de la pieza"
            >
              <Settings2 size={17} />
            </button>
            <button onClick={() => setPanel("design")} title="Biblioteca">
              <Component size={17} />
            </button>
          </div>
          {editing ? (
            <div className="property-manager">
              <div className="property-title">
                <span>{labels[editing.type]}</span>
                <button onClick={cancelActiveEdit} title="Cancelar">
                  <X size={15} />
                </button>
              </div>
              <div className="confirm-row">
                <button
                  className="accept"
                  onClick={acceptEdit}
                  title="Aceptar operación"
                  disabled={!canAccept}
                >
                  <Check size={23} />
                </button>
                <button
                  className="cancel"
                  onClick={cancelActiveEdit}
                  title="Cancelar operación"
                >
                  <X size={23} />
                </button>
                <span>
                  {doc.features.some((f) => f.id === editing.id)
                    ? "Editar operación"
                    : "Nueva operación"}
                </span>
              </div>
              <div className="property-section">
                <h3>
                  <ChevronDown size={12} /> Nombre
                </h3>
                <input
                  className="text-input"
                  aria-label="Nombre de operación"
                  value={editing.name}
                  onChange={(e) => changeDraft({ name: e.target.value })}
                />
              </div>
              {editing.type === "sketch" ? (
                <>
                  {sketchTool === "fillet" && entityProfile && (
                    <SketchFilletPanel
                      profile={entityProfile}
                      solution={sketchSolution}
                      selection={sketchSelection}
                      previousFilletId={previousFilletId}
                      onSelection={setSketchSelection}
                      onPreview={setFilletPreview}
                      onApply={applySketchFillet}
                      onCancel={cancelActiveEdit}
                    />
                  )}
                  {sketchTool === "chamfer" && entityProfile && (
                    <SketchChamferPanel
                      profile={entityProfile}
                      solution={sketchSolution}
                      selection={sketchSelection}
                      onSelection={setSketchSelection}
                      onPreview={setChamferPreview}
                      onApply={applySketchChamfer}
                      onCancel={cancelActiveEdit}
                    />
                  )}
                  {sketchTool === "trim" && (
                    <div className="property-section trim-property">
                      <h3>
                        <Scissors size={14} /> Recortar entidades
                      </h3>
                      <strong>Recortar hasta más cercano</strong>
                      <p>
                        Haz clic en el tramo rojo para eliminarlo hasta las
                        intersecciones vecinas.
                      </p>
                      <p>
                        Las líneas de construcción también delimitan el recorte.
                      </p>
                      <button
                        className="outline-button"
                        onClick={() => selectSketchTool("select")}
                      >
                        Terminar recorte · Esc
                      </button>
                    </div>
                  )}
                  {sketchTool === "extend" && (
                    <div className="property-section trim-property">
                      <h3>
                        <ArrowRightToLine size={14} /> Extender entidades
                      </h3>
                      <strong>Hasta la primera intersección</strong>
                      <p>
                        Apunta a la mitad de una línea o arco más cercana al
                        extremo que deseas prolongar. Haz clic para aceptar la
                        vista previa azul.
                      </p>
                      <p>
                        Las entidades de construcción también delimitan la
                        extensión. Los círculos sirven como límite.
                      </p>
                      <p>
                        Si no hay un límite en ese sentido, se busca en el
                        extremo opuesto. Comprueba la dirección de la vista
                        previa.
                      </p>
                      <button
                        className="outline-button"
                        onClick={() => selectSketchTool("select")}
                      >
                        Terminar extensión · Esc
                      </button>
                    </div>
                  )}
                  <PlaneSupportPanel
                    support={editingSupport!}
                    features={doc.features}
                    planes={availablePlanes}
                    onChange={changeSupport}
                    picking={pickingSupport}
                    canPickFace={!!model?.faces?.length && !busy}
                    onPickFace={() => setPickingSupport(!pickingSupport)}
                  />
                  <div className="property-section">
                    <h3>
                      <ChevronDown size={12} /> Posición del croquis
                    </h3>
                    <NumberField
                      label="Desfase"
                      value={editing.offset}
                      onChange={(offset) => changeDraft({ offset })}
                    />
                  </div>
                  {profile.kind === "entities" ? (
                    <EntitySketchPanel
                      profile={profile}
                      selection={sketchSelection}
                      onSelection={setSketchSelection}
                      onChange={changeEntityProfile}
                      solution={sketchSolution}
                      focusSection={sketchInspector}
                    />
                  ) : (
                    <>
                      <div className="property-section">
                        <h3>
                          <ChevronDown size={12} /> Parámetros
                        </h3>
                        <div className="profile-choice">
                          <button
                            className={
                              profile.kind === "rectangle" ? "active" : ""
                            }
                            onClick={() => {
                              changeDraft({
                                profile: {
                                  kind: "rectangle",
                                  center: profile.center,
                                  width: 60,
                                  height: 40,
                                },
                              });
                              setSketchTool("rectangle");
                            }}
                          >
                            <Square size={18} />
                            Rectángulo
                          </button>
                          <button
                            className={
                              profile.kind === "circle" ? "active" : ""
                            }
                            onClick={() => {
                              changeDraft({
                                profile: {
                                  kind: "circle",
                                  center: profile.center,
                                  radius: 15,
                                },
                              });
                              setSketchTool("circle");
                            }}
                          >
                            <Circle size={18} />
                            Círculo
                          </button>
                        </div>
                        {profile.kind === "rectangle" ? (
                          <>
                            <NumberField
                              label="Anchura"
                              value={profile.width}
                              onChange={(width) => changeProfile({ width })}
                            />
                            <NumberField
                              label="Altura"
                              value={profile.height}
                              onChange={(height) => changeProfile({ height })}
                            />
                          </>
                        ) : (
                          <NumberField
                            label="Radio"
                            value={profile.radius}
                            onChange={(radius) => changeProfile({ radius })}
                          />
                        )}
                        <NumberField
                          label="Centro X"
                          value={profile.center[0]}
                          onChange={(x) =>
                            changeProfile({ center: [x, profile.center[1]] })
                          }
                        />
                        <NumberField
                          label="Centro Y"
                          value={profile.center[1]}
                          onChange={(y) =>
                            changeProfile({ center: [profile.center[0], y] })
                          }
                        />
                      </div>
                      <div className="property-tip">
                        <Info size={15} />
                        <span>
                          Arrastra en el plano para dibujar. Introduce las cotas
                          para definir el perfil con precisión.
                        </span>
                      </div>
                      <div className="property-section">
                        <button
                          className="outline-button"
                          onClick={() => {
                            changeEntityProfile(convertProfile(profile));
                            setSketchTool("select");
                          }}
                        >
                          Convertir a entidades editables
                        </button>
                        <p className="muted-small">
                          Conserva el perfil y permite añadir contornos y
                          relaciones. Los acabados posteriores pueden requerir
                          volver a seleccionar sus aristas.
                        </p>
                      </div>
                    </>
                  )}
                </>
              ) : editing.type === "plane" ? (
                <>
                  <PlaneSupportPanel
                    support={editing.support}
                    features={doc.features}
                    planes={availablePlanes}
                    onChange={changeSupport}
                    picking={pickingSupport}
                    canPickFace={!!model?.faces?.length && !busy}
                    onPickFace={() => setPickingSupport(!pickingSupport)}
                  />
                  <div className="property-section">
                    <h3>
                      <ChevronDown size={12} /> Distancia al soporte
                    </h3>
                    <NumberField
                      label="Distancia del plano"
                      value={editing.offset}
                      onChange={(offset) => changeDraft({ offset })}
                    />
                    <button
                      className="outline-button"
                      onClick={() => changeDraft({ offset: -editing.offset })}
                    >
                      <RotateCw size={14} /> Invertir lado
                    </button>
                    <label className="check-option">
                      <input
                        type="checkbox"
                        checked={editing.reversed}
                        onChange={(event) =>
                          changeDraft({ reversed: event.target.checked })
                        }
                      />{" "}
                      Invertir normal del plano
                    </label>
                    <p className="muted-small">
                      La distancia sigue la normal del soporte. Invertir la
                      normal cambia la orientación de los croquis posteriores.
                    </p>
                  </div>
                </>
              ) : editing.type === "hole" ? (
                <HolePanel
                  feature={editing}
                  features={availableFeatures}
                  planes={availablePlanes}
                  section={holeSection}
                  onSection={(section) => {
                    setHoleSection(section);
                    setPickingSupport(false);
                  }}
                  onChange={changeDraft}
                  onSupport={changeSupport}
                  picking={pickingHole}
                  canPickFace={
                    !sourceLoading &&
                    !!sourceModel?.faces?.some((face) => face.frame)
                  }
                  onPickFace={() => setPickingSupport(!pickingSupport)}
                  selectedPosition={selectedHolePosition}
                  onSelectPosition={setSelectedHolePosition}
                  baseFeatureId={
                    sourceModel?.faces?.[0]?.ref.sourceFeatureId ?? null
                  }
                  loading={sourceLoading}
                />
              ) : editing.type === "sweep" || editing.type === "loft" ? (
                <SweepLoftPanel
                  feature={editing}
                  sketches={availableSketches}
                  onChange={changeDraft}
                  onError={(message) => notify(message, true)}
                />
              ) : isFaceOperation(editing) ? (
                <FaceOperationPanel
                  feature={editing}
                  features={availableFeatures}
                  planes={availablePlanes}
                  onChange={changeDraft}
                  onSupport={changeSupport}
                  onPickSupport={() => {
                    setPickingSupport(!pickingSupport);
                    setFacePreview(false);
                  }}
                  pickingSupport={pickingSupport}
                  canPickSupport={
                    !sourceLoading &&
                    !!sourceModel?.faces?.some((face) => face.frame)
                  }
                  preview={facePreview}
                  onPreview={(preview) => {
                    setFacePreview(preview);
                    setPickingSupport(false);
                  }}
                  canPreview={canAccept}
                  loading={sourceLoading}
                />
              ) : isRepetition(editing) ? (
                <PatternPanel
                  feature={editing}
                  features={availableFeatures}
                  planes={availablePlanes}
                  onChange={(patch) => {
                    if ("support" in patch && patch.support)
                      changeSupport(patch.support);
                    else changeDraft(patch);
                  }}
                  pickingFace={pickingMirror}
                  onPickFace={() => setPickingSupport(!pickingSupport)}
                  canPickFace={
                    !sourceLoading &&
                    !!sourceModel?.faces?.some((face) => face.frame)
                  }
                />
              ) : isEdgeFinish(editing) ? (
                <EdgeFinishPanel
                  feature={editing}
                  onSize={(size) => changeDraft({ size })}
                  onSelection={(selection) => {
                    changeDraft({ selection });
                    if (selection.mode === "selected") setFinishPreview(false);
                  }}
                  preview={finishPreview}
                  onPreview={setFinishPreview}
                  canPreview={canAccept}
                  loading={sourceLoading}
                />
              ) : (
                <>
                  <div className="property-section">
                    <h3>
                      <ChevronDown size={12} /> Perfil seleccionado
                    </h3>
                    <select
                      aria-label="Croquis de la operación"
                      value={"sketchId" in editing ? editing.sketchId : ""}
                      onChange={(e) =>
                        changeDraft({ sketchId: e.target.value })
                      }
                    >
                      {availableSketches.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editing.type === "revolve" ? (
                    <div className="property-section">
                      <h3>
                        <ChevronDown size={12} /> Dirección 1
                      </h3>
                      <NumberField
                        label="Ángulo"
                        value={editing.angle}
                        onChange={(angle) => changeDraft({ angle })}
                        unit="°"
                      />
                      <p className="muted-small">
                        Eje vertical Y del croquis. El perfil debe quedar a un
                        lado del eje.
                      </p>
                    </div>
                  ) : (
                    <ExtrudePanel
                      feature={editing}
                      features={availableFeatures}
                      planes={availablePlanes}
                      baseFeatureId={
                        sourceModel?.faces?.[0]?.ref.sourceFeatureId ?? null
                      }
                      preferredTarget={
                        preferredEndPlane
                          ? {
                              kind: "plane",
                              planeId: preferredEndPlane.id,
                            }
                          : {
                              kind: "principal",
                              plane:
                                availableSketches.find(
                                  (sketch) => sketch.id === editing.sketchId,
                                )?.plane ?? "XY",
                            }
                      }
                      picking={pickingExtrude}
                      loading={sourceLoading}
                      canPickFace={
                        !!sourceModel?.faces?.length && !sourceLoading
                      }
                      onTarget={changeEndTarget}
                      onPickFace={() => setPickingEndFace(!pickingExtrude)}
                      onChange={(patch) => {
                        changeDraft(patch);
                        if ("endCondition" in patch)
                          setPickingEndFace(
                            patch.endCondition?.kind === "upToSurface" &&
                              editing.endCondition?.kind !== "upToSurface" &&
                              !!sourceModel?.faces?.length &&
                              !preferredEndPlane,
                          );
                      }}
                    />
                  )}
                  <div className="property-tip">
                    <Info size={15} />
                    <span>
                      {editing.type === "cut"
                        ? "El perfil se sustrae del sólido existente."
                        : "La vista se actualiza al modificar los parámetros."}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="tree-filter">
                <Search size={13} />
                <input
                  aria-label="Filtro del árbol"
                  placeholder="Filtrar operaciones"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery("")}>
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="tree">
                <div
                  className="tree-document"
                  onClick={() => setTreeOpen(!treeOpen)}
                >
                  <ChevronDown size={12} className={treeOpen ? "" : "closed"} />
                  <Box size={18} />
                  <strong>{doc.name}</strong>
                  <span>{dirty ? "*" : ""}</span>
                </div>
                {treeOpen && (
                  <>
                    <div
                      className="tree-row subdued"
                      onClick={() => setPanel("properties")}
                    >
                      <ChevronRight size={11} />
                      <Info size={15} />
                      <span>Propiedades de la pieza</span>
                    </div>
                    <div
                      className="tree-row subdued"
                      onClick={() => setPanel("properties")}
                    >
                      <ChevronRight size={11} />
                      <Layers size={15} />
                      <span>Material &lt;sin especificar&gt;</span>
                    </div>
                    {(["XY", "XZ", "YZ"] as Plane[]).map((p) => (
                      <div
                        className={
                          "tree-row plane " + (selected === p ? "selected" : "")
                        }
                        key={p}
                        onClick={() => {
                          setPlane(p);
                          setSelected(p);
                          setFaceSelection(null);
                        }}
                      >
                        <span className="tree-indent" />
                        <Square size={15} />
                        <span>{planeNames[p]}</span>
                      </div>
                    ))}
                    <div className="tree-row origin">
                      <span className="tree-indent" />
                      <Move3D size={16} />
                      <span>Origen</span>
                    </div>
                    <div className="tree-divider" />
                    {doc.features
                      .filter((f) => f.type !== "sketch" || !consumed.has(f.id))
                      .filter(
                        (f) =>
                          !query ||
                          f.name.toLowerCase().includes(query.toLowerCase()) ||
                          featureSketchIds(f).some((id) =>
                            doc.features
                              .find((s) => s.id === id)
                              ?.name.toLowerCase()
                              .includes(query.toLowerCase()),
                          ),
                      )
                      .map((f) => (
                        <div key={f.id}>
                          {row(f)}
                          {featureSketchIds(f)
                            .map((id) => doc.features.find((s) => s.id === id))
                            .filter((feature): feature is Feature => !!feature)
                            .map((feature) => row(feature, true))}
                        </div>
                      ))}
                    <div className="rollback-bar">
                      <span />
                      <ChevronUp size={12} />
                    </div>
                  </>
                )}
              </div>
              {faceSelection && !editing && (
                <div className="face-selection-summary">
                  <strong>
                    {faceSelection.frame
                      ? "Cara plana seleccionada"
                      : "Cara curva seleccionada"}
                  </strong>
                  <span>
                    {
                      doc.features.find(
                        (feature) =>
                          feature.id === faceSelection.ref.sourceFeatureId,
                      )?.name
                    }
                  </span>
                  <button
                    className="outline-button"
                    disabled={!faceSelection.frame}
                    onClick={() => startSketch()}
                  >
                    <Pencil size={14} /> Crear croquis en cara
                  </button>
                  <button
                    className="outline-button"
                    disabled={!faceSelection.frame}
                    onClick={startPlane}
                  >
                    <PanelTop size={14} /> Crear plano desde cara
                  </button>
                </div>
              )}
              {selectedFeature && (
                <div className="selection-tools">
                  <span>{selectedFeature.name}</span>
                  <div>
                    <IconButton
                      icon={Pencil}
                      title="Editar operación"
                      onClick={() => editFeature(selectedFeature)}
                    />
                    <IconButton
                      icon={Eye}
                      title={
                        selectedFeature.suppressed
                          ? "Activar operación"
                          : "Suprimir operación"
                      }
                      onClick={() =>
                        apply(
                          updateFeature(doc, selectedFeature.id, {
                            suppressed: !selectedFeature.suppressed,
                          }),
                        )
                      }
                    />
                    <IconButton
                      icon={Trash2}
                      title="Eliminar operación"
                      onClick={deleteSelected}
                    />
                  </div>
                </div>
              )}
              <div className="manager-footer">
                <span className="blue-dot" /> Configuración: Predeterminada
              </div>
            </>
          )}
        </aside>
        <section className="graphics-area">
          <div className="viewport-toolbar">
            <IconButton
              icon={Maximize}
              title="Ajustar a pantalla (F)"
              onClick={() => changeView("fit")}
            />
            <i />
            <IconButton
              icon={Box}
              title="Vista isométrica (Ctrl+7)"
              onClick={() => changeView("iso")}
            />
            <IconButton
              icon={Square}
              title="Vista frontal (Ctrl+1)"
              onClick={() => changeView("front")}
            />
            <IconButton
              icon={Layers}
              title="Vista superior (Ctrl+5)"
              onClick={() => changeView("top")}
            />
            <i />
            <IconButton
              icon={Eye}
              title="Sombreado con aristas"
              active={display === "edges"}
              onClick={() =>
                setDisplay(display === "edges" ? "shaded" : "edges")
              }
            />
            <IconButton
              icon={Grid3X3}
              title="Vista de alambre"
              active={display === "wire"}
              onClick={() => setDisplay(display === "wire" ? "edges" : "wire")}
            />
            <IconButton
              icon={Crosshair}
              title="Mostrar cuadrícula"
              active={grid}
              onClick={() => setGrid(!grid)}
            />
            <i />
            <IconButton
              icon={ScanLine}
              title="Seleccionar aristas"
              active={selectionMode === "edge" || pickingFinish}
              disabled={!!editing}
              onClick={() => {
                setSelectionMode(selectionMode === "edge" ? "body" : "edge");
                setEdgeSelection([]);
                setSelected(null);
                setFaceSelection(null);
              }}
            />
            <IconButton
              icon={MousePointer2}
              title="Seleccionar caras"
              active={
                selectionMode === "face" ||
                pickingSupport ||
                pickingFaceOperation ||
                pickingExtrude
              }
              disabled={!!editing}
              onClick={() => {
                setSelectionMode(selectionMode === "face" ? "body" : "face");
                setFaceSelection(null);
                setEdgeSelection([]);
                setSelected(null);
              }}
            />
            <IconButton
              icon={PanelTop}
              title="Mostrar planos de referencia"
              active={showPlanes}
              onClick={() => setShowPlanes(!showPlanes)}
            />
            <ChevronDown size={11} />
          </div>
          {editing?.type === "sketch" && !pickingSupport ? (
            <SketchCanvas
              key={editing.id}
              profile={filletConvertedProfile ?? editing.profile}
              onChange={(p) =>
                p.kind === "entities"
                  ? changeEntityProfile(p)
                  : changeDraft({ profile: p })
              }
              tool={sketchTool}
              plane={sketchPlaneShortLabel}
              referenceLines={referenceLines}
              selection={sketchSelection}
              onSelection={setSketchSelection}
              solution={sketchSolution}
              fitStamp={view.stamp}
              chamferPreview={sketchTool === "chamfer" ? chamferPreview : null}
              filletPreview={sketchTool === "fillet" ? filletPreview : null}
            />
          ) : placingHoles && holeEditing ? (
            holeFrame ? (
              <HolePositionsCanvas
                key={`${holeEditing.id}:${JSON.stringify(holeEditing.support)}`}
                positions={holeEditing.positions}
                onChange={(positions) => changeDraft({ positions })}
                selectedId={selectedHolePosition}
                onSelect={setSelectedHolePosition}
                diameter={holeEditing.diameter}
                headDiameter={
                  holeEditing.head.kind === "simple"
                    ? holeEditing.diameter
                    : holeEditing.head.diameter
                }
                referenceLines={holeReferenceLines}
                fitStamp={view.stamp}
                plane={sketchPlaneShortLabel}
              />
            ) : (
              <div className="hole-plane-pending">
                {sourceLoading || busy
                  ? "Preparando el plano de posiciones…"
                  : "Selecciona un soporte plano válido para colocar los centros."}
              </div>
            )
          ) : (
            <Viewport
              model={visibleModel}
              view={view}
              display={display}
              grid={grid}
              selected={
                !!selectedFeature &&
                selectedFeature.type !== "sketch" &&
                selectedFeature.type !== "plane" &&
                selectionMode === "body" &&
                !finishEditing &&
                !faceEditing &&
                !extrudeEditing &&
                !holeEditing
              }
              selectionMode={
                pickingSupport ||
                pickingFaceOperation ||
                pickingExtrude ||
                pickingHole
                  ? "face"
                  : pickingFinish
                    ? "edge"
                    : finishEditing ||
                        faceEditing ||
                        extrudeEditing ||
                        holeEditing
                      ? "body"
                      : selectionMode
              }
              selectedEdges={selectedEdges}
              onSelectEdge={toggleEdge}
              visibleSketchIds={visibleSketchIds}
              selectedSketchId={selectedSketchId}
              selectedFace={faceSelection?.ref}
              selectedFaces={
                pickingFaceOperation && !pickingSupport
                  ? operationFaces
                  : pickingExtrude &&
                      extrudeEditing?.endCondition?.kind === "upToSurface" &&
                      extrudeEditing.endCondition.target.kind === "face"
                    ? [extrudeEditing.endCondition.target.face]
                    : []
              }
              onSelectFace={selectFace}
              selectedPlaneId={selectedPlaneId}
              showPlanes={showPlanes}
              onSelectPlane={(id) => {
                if (!editing) {
                  setSelected(id);
                  setFaceSelection(null);
                }
              }}
              onSelect={() => {
                const last = [...doc.features]
                  .reverse()
                  .find(
                    (f) =>
                      f.type !== "sketch" &&
                      f.type !== "plane" &&
                      !f.suppressed,
                  );
                if (last && !editing) {
                  setSelected(last.id);
                  setFaceSelection(null);
                }
              }}
            />
          )}
          {!model?.vertices.length &&
            !hasVisiblePlane &&
            !hasVisibleSketch &&
            !editing &&
            ready &&
            !busy && (
              <div className="empty-canvas">
                <div>
                  <Pencil size={34} />
                </div>
                <h2>
                  {sketches.some((s) => !s.suppressed)
                    ? "Da volumen al croquis"
                    : "Empieza con un croquis"}
                </h2>
                <p>
                  {sketches.some((s) => !s.suppressed)
                    ? "Selecciona un croquis del árbol y crea una operación."
                    : "Selecciona un plano y dibuja tu primera pieza."}
                </p>
                <button
                  onClick={() =>
                    sketches.some((s) => !s.suppressed)
                      ? startFeature("extrude")
                      : startSketch()
                  }
                >
                  <Plus size={15} />{" "}
                  {sketches.some((s) => !s.suppressed)
                    ? "Extruir croquis"
                    : "Crear croquis"}
                </button>
                <button className="text-link" onClick={loadDemo}>
                  Abrir pieza de ejemplo
                </button>
              </div>
            )}
          <div className="viewport-label">
            <strong>
              {editing?.type === "sketch"
                ? "Editando " + editing.name
                : doc.name}
            </strong>
            <span>
              {holeEditing
                ? pickingHole
                  ? "Selecciona la cara de entrada · Pieza anterior al taladro"
                  : placingHoles
                    ? `Centros del taladro · ${sketchPlaneLabel}`
                    : "Vista previa del taladro"
                : editing?.type === "sketch"
                  ? pickingSupport
                    ? "Selecciona una cara plana"
                    : sketchPlaneLabel
                  : pickingExtrude
                    ? "Selecciona la cara de destino · Pieza anterior a la operación"
                    : pickingFaceOperation
                      ? pickingSupport
                        ? "Selecciona una cara plana como plano neutro"
                        : `Selecciona caras · ${operationFaces.length} seleccionadas`
                      : faceEditing
                        ? "Vista previa de la operación"
                        : pickingFinish
                          ? "Selecciona aristas · Pieza anterior al acabado"
                          : finishEditing
                            ? "Vista previa del acabado"
                            : pickingSupport
                              ? "Selecciona una cara plana"
                              : selectionMode === "face"
                                ? faceSelection?.frame
                                  ? "Cara plana seleccionada"
                                  : "Selecciona una cara"
                                : selectionMode === "edge"
                                  ? `Selección de aristas · ${edgeSelection.length} seleccionadas`
                                  : "Configuración predeterminada"}
            </span>
          </div>
          {editing && (
            <div className="canvas-confirm">
              <button
                onClick={acceptEdit}
                className="accept"
                title="Aceptar"
                disabled={!canAccept}
              >
                <Check size={30} />
              </button>
              <button onClick={cancelActiveEdit} className="cancel" title="Cancelar">
                <X size={28} />
              </button>
            </div>
          )}
          {busy && (
            <div className="build-indicator">
              <Loader2 className="spin" size={14} />
              {ready
                ? "Reconstruyendo pieza…"
                : "Iniciando espacio de trabajo…"}
            </div>
          )}
          {visibleError && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={16} />
              <span>{visibleError}</span>
            </div>
          )}
          {!busy &&
          previewCurrent &&
          !visibleError &&
          !emptyEdgeSelection &&
          model?.warnings.length ? (
            <div className="error-banner" role="status">
              <Info size={16} />
              <span>{model.warnings.join(" · ")}</span>
            </div>
          ) : null}
          <div className="triad" aria-label="Nombre de la vista">
            <span>
              {editing?.type === "sketch" || placingHoles
                ? sketchPlaneShortLabel
                : view.name === "iso"
                  ? "Isométrica"
                  : view.name === "fit"
                    ? "Vista de modelo"
                    : {
                        front: "Frontal",
                        back: "Posterior",
                        top: "Superior",
                        bottom: "Inferior",
                        left: "Izquierda",
                        right: "Derecha",
                      }[view.name]}
            </span>
          </div>
          <div className="canvas-hint">
            {placingHoles ? (
              "Centros editables · Coordenadas X/Y en el panel"
            ) : editing?.type === "sketch" ? (
              "Dibuja entidades · Ctrl: selección múltiple · Cotas y relaciones en el panel"
            ) : (
              <>
                Arrastrar: girar <b>·</b> Rueda: zoom <b>·</b> Botón central:
                desplazar
              </>
            )}
          </div>
        </section>
        <aside className="taskbar">
          <IconButton
            icon={FolderOpen}
            title="Biblioteca de diseño"
            active={panel === "design"}
            onClick={() => setPanel(panel === "design" ? null : "design")}
          />
          <IconButton
            icon={Layers}
            title="Propiedades físicas"
            active={panel === "properties"}
            onClick={() =>
              setPanel(panel === "properties" ? null : "properties")
            }
          />
          <IconButton
            icon={HelpCircle}
            title="Ayuda y atajos"
            onClick={() => setShowHelp(true)}
          />
        </aside>
        {panel && (
          <div className="task-panel">
            <h3>
              {panel === "properties"
                ? "Propiedades físicas"
                : "Biblioteca de diseño"}
              <button onClick={() => setPanel(null)} title="Cerrar panel">
                <X size={15} />
              </button>
            </h3>
            {panel === "properties" ? (
              <>
                <p className="panel-intro">{doc.name}</p>
                <dl>
                  <dt>Volumen</dt>
                  <dd>
                    {((visibleModel?.volume ?? 0) / 1000).toLocaleString(
                      "es-ES",
                      {
                        maximumFractionDigits: 3,
                      },
                    )}{" "}
                    cm³
                  </dd>
                  <dt>Envolvente X</dt>
                  <dd>
                    {(
                      (visibleModel?.bounds.max[0] ?? 0) -
                      (visibleModel?.bounds.min[0] ?? 0)
                    ).toFixed(2)}{" "}
                    mm
                  </dd>
                  <dt>Envolvente Y</dt>
                  <dd>
                    {(
                      (visibleModel?.bounds.max[1] ?? 0) -
                      (visibleModel?.bounds.min[1] ?? 0)
                    ).toFixed(2)}{" "}
                    mm
                  </dd>
                  <dt>Envolvente Z</dt>
                  <dd>
                    {(
                      (visibleModel?.bounds.max[2] ?? 0) -
                      (visibleModel?.bounds.min[2] ?? 0)
                    ).toFixed(2)}{" "}
                    mm
                  </dd>
                  <dt>Operaciones</dt>
                  <dd>
                    {
                      doc.features.filter(
                        (f) => f.type !== "sketch" && f.type !== "plane",
                      ).length
                    }
                  </dd>
                  <dt>Croquis</dt>
                  <dd>{sketches.length}</dd>
                </dl>
                <p className="muted-small">
                  Las propiedades corresponden al sólido reconstruido. Unidades:
                  milímetros.
                </p>
              </>
            ) : (
              <>
                <p className="panel-intro">Piezas para empezar</p>
                <button className="library-card" onClick={loadDemo}>
                  <Box size={40} />
                  <strong>Placa de montaje</strong>
                  <span>100 × 70 × 12 mm · 4 taladros</span>
                </button>
                <button className="outline-button" onClick={newDoc}>
                  <Plus size={15} /> Pieza vacía
                </button>
                <button className="library-card" onClick={loadConstrainedDemo}>
                  <Ruler size={36} />
                  <strong>Placa con croquis acotado</strong>
                  <span>8 entidades · cotas y relaciones · 4 agujeros</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadSketchRelationsDemo("angle")}
                >
                  <strong>Placa con cota angular</strong>
                  <span>Triángulo · ángulo conductor de 60°</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadSketchRelationsDemo("tangent")}
                >
                  <strong>Placa con arco tangente</strong>
                  <span>Extremo R15 · dos uniones tangentes</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadSketchRelationsDemo("driven")}
                >
                  <strong>Placa con cotas conducidas</strong>
                  <span>
                    Medidas de referencia · ángulo reflejo y distancias
                  </span>
                </button>
                <button className="library-card" onClick={loadTrimDemo}>
                  <Scissors size={36} />
                  <strong>Croquis para recortar</strong>
                  <span>
                    Círculo R20 y línea · elimina el arco superior y las dos
                    colas
                  </span>
                </button>
                <button className="library-card" onClick={loadExtendDemo}>
                  <ArrowRightToLine size={36} />
                  <strong>Croquis para extender</strong>
                  <span>
                    Arco R20 y línea corta · prolonga sus dos extremos para
                    cerrar
                  </span>
                </button>
                <button className="library-card" onClick={loadChamferDemo}>
                  <Triangle size={36} />
                  <strong>Placa para achaflanar</strong>
                  <span>
                    Rectángulo 10 × 6 · selecciona una esquina y define el chaflán
                  </span>
                </button>
                <button className="library-card" onClick={() => loadFilletDemo()}>
                  <CornerDownRight size={36} />
                  <strong>Placa para redondear</strong>
                  <span>Rectángulo 10 × 6 · radio editable y esquinas virtuales</span>
                </button>
                <button className="library-card" onClick={() => loadFilletDemo("curved")}>
                  <CornerDownRight size={36} />
                  <strong>Placa para redondear con arco</strong>
                  <span>Línea y arco R5 · selecciona el origen y prueba un radio de 1 mm</span>
                </button>
                <button className="library-card" onClick={() => loadFilletProlongationDemo("line-arc")}>
                  <CornerDownRight size={36} />
                  <strong>Redondeo con prolongación de arco</strong>
                  <span>Croquis abierto · une la línea y el arco R10 con un redondeo R2</span>
                </button>
                <button className="library-card" onClick={() => loadFilletProlongationDemo("arc-arc")}>
                  <CornerDownRight size={36} />
                  <strong>Redondeo entre dos arcos separados</strong>
                  <span>Croquis abierto · prolonga los dos arcos R10 hasta un redondeo R2</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadAdvancedDemo("sweep")}
                >
                  <MoveUpRight size={36} />
                  <strong>Conducto barrido</strong>
                  <span>Perfil R4 · trayectoria de tres tramos</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadAdvancedDemo("loft")}
                >
                  <Layers size={36} />
                  <strong>Transición de tres secciones</strong>
                  <span>Recubrimiento circular · cotas editables</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadPatternDemo("linearPattern")}
                >
                  <Grid3X3 size={36} />
                  <strong>Placa con matriz de taladros</strong>
                  <span>3 × 2 instancias · separación editable</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadPatternDemo("circularPattern")}
                >
                  <RotateCw size={36} />
                  <strong>Brida con matriz circular</strong>
                  <span>6 taladros · distribución de 360°</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadPatternDemo("mirror")}
                >
                  <Component size={36} />
                  <strong>Placa con salientes simétricos</strong>
                  <span>Geometría reflejada en el plano YZ</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadFaceDemo("shell")}
                >
                  <BoxSelect size={36} />
                  <strong>Caja con vaciado</strong>
                  <span>100 × 70 × 40 mm · pared de 3 mm</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadFaceDemo("draft")}
                >
                  <Cone size={36} />
                  <strong>Bloque con desmoldeo</strong>
                  <span>Cuatro caras · plano neutro XY · 5°</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadExtrudeDemo("throughAll")}
                >
                  <Scissors size={36} />
                  <strong>Placa con corte por todo</strong>
                  <span>Taladro R8 · profundidad asociada a la pieza</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadExtrudeDemo("untilNext")}
                >
                  <BoxSelect size={36} />
                  <strong>Caja con corte hasta siguiente</strong>
                  <span>Vaciado de 4 mm · corte de la primera pared</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadExtrudeDemo("upToSurface")}
                >
                  <MoveUpRight size={36} />
                  <strong>Saliente hasta techo cilíndrico</strong>
                  <span>Perfil R5 · extremo sobre una cara curva</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadHoleDemo("blind")}
                >
                  <Crosshair size={25} />
                  <strong>Placa con taladros ciegos</strong>
                  <span>Cuatro centros · Ø8 · punta de 118°</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadHoleDemo("counterbore")}
                >
                  <Crosshair size={25} />
                  <strong>Placa con taladros refrentados</strong>
                  <span>Paso Ø8 · alojamiento Ø16 × 4 mm</span>
                </button>
                <button
                  className="library-card"
                  onClick={() => loadHoleDemo("countersink")}
                >
                  <Crosshair size={25} />
                  <strong>Placa con taladros avellanados</strong>
                  <span>Paso Ø8 · avellanado Ø16 a 90°</span>
                </button>
              </>
            )}
          </div>
        )}
      </main>
      <div className="document-tabs">
        <button title="Navegar documentos">
          <PanelLeft size={14} />
        </button>
        <button className="active">
          <Box size={14} />
          {doc.name}
          {dirty ? " *" : ""}
          <span>●</span>
        </button>
        <button title="Nueva pieza" onClick={newDoc}>
          <Plus size={14} />
        </button>
        <div />
        <span>Pieza</span>
      </div>
      <footer className="statusbar">
        <span>
          {busy ? (
            <Loader2 size={12} className="spin" />
          ) : visibleError ? (
            <AlertTriangle size={12} />
          ) : (
            <CheckCircle2 size={12} />
          )}{" "}
          {busy
            ? "Reconstruyendo"
            : entityProfile
              ? (sketchSolution?.message ?? "Editando croquis")
              : emptyEdgeSelection
                ? "Selecciona aristas"
                : visibleError
                  ? "Revisar operación"
                  : editing
                    ? "Editando operación"
                    : "Listo"}
        </span>
        <span className="status-message">
          {selectedFeature?.name ??
            "Selecciona una operación para editar sus parámetros"}
        </span>
        <span>{visibleModel?.vertices.length ? "Sólido" : "Sin sólido"}</span>
        <span>
          MMGS <ChevronDown size={10} />
        </span>
        <span>1:1</span>
      </footer>
      {toast && (
        <div
          className={"toast" + (toastError ? " toast-error" : "")}
          role={toastError ? "alert" : "status"}
        >
          {toastError ? (
            <AlertTriangle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}
          {toast}
        </div>
      )}
      {exporting && (
        <div className="toast">
          <Loader2 size={17} className="spin" />
          Exportando geometría…
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(false)}>
              <X size={18} />
            </button>
            <div className="modal-brand">
              <Box size={25} />
              <strong>SolidFlow</strong>
              <span>0.13</span>
            </div>
            <h2>Tu primer recorrido</h2>
            <ol>
              <li>
                Selecciona <b>Planta, Alzado o Vista lateral</b> en el árbol.
                También puedes activar <b>Seleccionar caras</b> y elegir una
                cara plana, o crear un plano desplazado con{" "}
                <b>Geometría de referencia</b>.
              </li>
              <li>
                Abre <b>Croquis</b> y dibuja líneas, rectángulos, círculos o
                arcos. Selecciona entidades o puntos para añadir cotas y
                relaciones.
              </li>
              <li>
                Acepta el croquis y utiliza <b>Saliente/Base extruido</b>,{" "}
                <b>Corte extruido</b> o <b>Revolución</b>. En extrusión y corte
                puedes elegir <b>Por todo</b>, <b>Hasta siguiente</b> o{" "}
                <b>Hasta superficie</b> para que el extremo siga la pieza o una
                referencia al reconstruir.
              </li>
              <li>
                <b>Barrido</b> une un perfil cerrado con un recorrido abierto.{" "}
                <b>Recubrir</b> une secciones ordenadas de varios croquis.
                Prueba sus ejemplos en la biblioteca.
              </li>
              <li>
                Haz doble clic en una operación para editarla. Guarda la pieza o
                exporta STEP/STL.
              </li>
              <li>
                Para un acabado, abre <b>Redondeo</b> o <b>Chaflán</b>,
                selecciona aristas de la pieza y comprueba <b>Vista previa</b>{" "}
                antes de aceptar. Puedes activar <b>Todas las aristas</b>.
              </li>
            </ol>
            <div className="shortcut-list">
              <span>
                Guardar <kbd>Ctrl S</kbd>
              </span>
              <span>
                Deshacer <kbd>Ctrl Z</kbd>
              </span>
              <span>
                Ajustar vista <kbd>F</kbd>
              </span>
              <span>
                Isométrica <kbd>Ctrl 7</kbd>
              </span>
            </div>
            <p>
              Los croquis admiten contornos de líneas y arcos, círculos y
              agujeros. Los comandos atenuados pertenecen a módulos todavía
              pendientes. El formato editable es .solidflow; permite exportar
              la geometría a STEP y STL.
            </p>
            <button
              className="primary-button"
              onClick={() => setShowHelp(false)}
            >
              Volver a la pieza
            </button>
          </div>
        </div>
      )}
      {rename && (
        <div className="modal-backdrop">
          <form
            className="modal small"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              try {
                apply({
                  ...doc,
                  name: String(data.get("name")).trim(),
                  updatedAt: new Date().toISOString(),
                });
                setRename(false);
              } catch (err) {
                notify((err as Error).message, true);
              }
            }}
          >
            <h2>Nombre de la pieza</h2>
            <input
              className="text-input"
              name="name"
              defaultValue={doc.name}
              required
              maxLength={100}
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="outline-button"
                onClick={() => setRename(false)}
              >
                Cancelar
              </button>
              <button className="primary-button">Guardar</button>
            </div>
          </form>
        </div>
      )}
      {discardOpen && (
        <div className="modal-backdrop" onClick={() => finishDiscard(false)}>
          <div
            ref={discardDialog}
            className="modal small"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-description"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const buttons =
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
              const first = buttons[0];
              const last = buttons[buttons.length - 1];
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
              }
            }}
          >
            <h2 id="discard-title">Cambios sin guardar</h2>
            <p id="discard-description">
              Hay cambios sin guardar en esta pieza. Si continúas, se perderán
              los cambios y la operación que estés editando.
            </p>
            <div className="modal-actions">
              <button
                className="outline-button"
                onClick={() => finishDiscard(false)}
              >
                Cancelar
              </button>
              <button
                className="primary-button"
                onClick={() => finishDiscard(true)}
              >
                Continuar sin guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
