import { useViewHistory } from './components/useViewHistory'
import { isRevolutionFeature } from './cad/revolutionExtent'
import { standardViews, viewShortcutCommand, type ViewName, type ViewRequest } from './components/viewNavigation'
import { validateNormalToTarget } from './components/normalToView'
import { partNormalToTarget, partViewReferenceKey, togglePartViewReference, type PartViewReference } from './components/partNormalTo'
import { ViewOrientationControls } from './components/ViewOrientationControls'
import { NamedViewsDialog } from './components/NamedViewsDialog'
import { sameDocumentExceptNamedViews, useNamedDocumentViews } from './components/useNamedDocumentViews'
import { requestNewDocument, useNewDocumentDialog } from './components/useNewDocumentDialog';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  Triangle,
  Minus,
  Spline,
  PanelTop,
  BoxSelect,
  Cone,
  ArrowRightToLine,
  FlipHorizontal2,
  CopyPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Viewport from "./components/Viewport";
import type { PartSelectionMode } from "./components/partSelection";
import SketchCanvas from "./components/SketchCanvas";
import AssemblyMenuBar, { type AssemblyMenuDefinition } from "./components/AssemblyMenuBar";
import CommandHeader from "./components/CommandHeader";
import PartFeatureContextMenu from "./components/PartFeatureContextMenu";
import CadContextMenu, { type CadContextAction } from './components/CadContextMenu';
import { resolvePartContextTarget, type PartContextTarget, type PartViewportContextRequest } from './components/partViewportContext';
import EntitySketchPanel from "./components/EntitySketchPanel";
import SketchChamferPanel from "./components/SketchChamferPanel";
import type { ChamferPlan } from "./sketch/chamfer";
import SketchFilletPanel from "./components/SketchFilletPanel";
import type { FilletPlan, FilletBatchPlan } from "./sketch/fillet";
import { solveFilletApplication } from "./sketch/filletApplication";
import SketchMirrorPanel from "./components/SketchMirrorPanel";
import type { MirrorPlan } from "./sketch/mirror";
import { solveMirrorApplication } from "./sketch/mirrorApplication";
import SketchOffsetPanel from "./components/SketchOffsetPanel";
import type { OffsetPlan } from "./sketch/offset";
import { solveOffsetApplication } from "./sketch/offsetApplication";
import PlaneSupportPanel, {
  supportLabel,
} from "./components/PlaneSupportPanel";
import { solveSketch } from "./sketch/solver";
import { repositionDisplayedSketch, type PointRepositionCommand } from "./sketch/point-reposition";
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
import { createFilletBatchDocument } from "./examples/sketch-fillet-batch";
import { createSketchMirrorDocument, createSketchMirrorArcDocument } from "./examples/sketch-mirror";
import { createSketchOffsetDocument } from "./examples/sketch-offset";
import {
  createLoftExample,
  createSweepExample,
} from "./examples/advanced-shapes";
import EdgeFinishPanel from "./components/EdgeFinishPanel";
import SweepLoftPanel from "./components/SweepLoftPanel";
import PatternPanel from "./components/PatternPanel";
import FaceOperationPanel from "./components/FaceOperationPanel";
import { BodyList, BodyFeaturePanel } from "./components/BodyManagementPanel";
import { bodySelectionDtos } from "./cad/body-selection";
import { applyBodyCommand, prepareBodyCommand, isBodyCommandFeature, sameBodyReference, withBodySelection } from "./model/bodyCommands";
import { createdBodyIds, featureBodyReferences, featureCurrentBodyReferences } from "./model/bodyReferences";
import { reconcileBodyPatternDraft } from "./model/bodyPatterns";
import { createEdgeSelectionIndex, createFaceSelectionIndex } from "./cad/selection.references";
import ExtrudePanel from "./components/ExtrudePanel";
import RevolvePanel, { mergeRevolutionDraft } from "./components/RevolvePanel";
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
import { buildPartFeatureTree, partTreeChildrenId, revealPartSketchOwners, treeOccurrenceKey } from "./model/partFeatureTree";
import { initialPartTargets } from "./model/partWorkflow";
import { canContinuePartSketch, stagePartSketch, unusedPartSketchPreview } from "./model/partSketchContinuation";
import { createPartSequenceDocument } from "./examples/part-sequence";
import { importStructuralStep } from "./model/structuralStepImport";
import { importStepPart, type StepFile } from "./model/stepImport";
import { MAX_STEP_BYTES } from "./model/stepSource";
import { initialLoftSection, resolvedSweepPath } from "./model/advancedInputs";
import { buildModel, exportCad, initKernel, importAssemblyStep } from "./cad/kernel";
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
  BodyReference,
  CombineFeature,
  RevolutionFeature,
} from "./cad/kernel.types";
import {
  createDemoDocument,
  createDocument,
  validateDocument,
  serializeDocument,
  addFeature,
  updateFeature,
  removeFeature,
  DocumentHistory,
  type Document,
} from "./model/document";
import AssemblyWorkspace from "./components/AssemblyWorkspace";
import ConfiguredAssemblyWorkspace from "./components/ConfiguredAssemblyWorkspace";
import { createEmptyAssembly } from "./examples/assembly";
import { createAssemblyFromPart } from "./model/assemblyFromPart";
import { MAX_ASSEMBLY_BYTES, type AssemblyDocument } from "./model/assemblyDocument";
import { parseCadDocument, serializeCadDocument, validateCadDocument, type CadDocument } from "./model/cadDocument";
import type { AssemblyConfiguredDocument } from "./model/assemblyConfiguredDocument";
import { readCadRecovery, writeCadRecovery } from "./model/cadRecovery";

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
  revolvedCut: "Corte-Revolución",
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
  importedSolid: "Sólido importado STEP",
  importedBodies: "Cuerpos importados STEP",
  combine: "Combinar",
};
const featureIcons: Record<string, LucideIcon> = {
  sketch: Pencil,
  extrude: Box,
  cut: Scissors,
  revolve: RotateCw,
  revolvedCut: Scissors,
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
  importedSolid: FolderOpen,
  importedBodies: FolderOpen,
  combine: Component,
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
interface DocumentSession {
  document: CadDocument;
  path?: string;
  saved?: string;
  epoch: number;
  skipInitialRecoveryWrite?: boolean;
}
function initialDocumentSession(): DocumentSession {
  try {
    const recovery = readCadRecovery(localStorage);
    if (recovery.status === "recovered") return { document: recovery.document, epoch: 0 };
    return { document: createDemoDocument(), epoch: 0, skipInitialRecoveryWrite: recovery.status !== "missing" };
  } catch {
    // Accessing localStorage itself can fail. Preserve existing recovery bytes
    // until the user explicitly changes or replaces the fallback document.
    return { document: createDemoDocument(), epoch: 0, skipInitialRecoveryWrite: true };
  }
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
  children,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  onClick?: () => void;
  children?: ReactNode;
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
      {children}
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
    </button>
  );
}
function CommandGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="command-group part-command-group" role="group" aria-label={label}>
      <div className="part-command-group-content">{children}</div>
      <span className="part-command-group-label" aria-hidden="true">{label}</span>
    </div>
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
  const [session, setSession] = useState<DocumentSession>(initialDocumentSession);
  const replaceDocument = (value: CadDocument, path?: string, saved?: string) => {
    const document = validateCadDocument(value);
    const serialized = serializeCadDocument(document);
    setSession(previous => ({ document, path, saved: saved === undefined ? undefined : serialized, epoch: previous.epoch + 1 }));
  };
  return session.document.version === 3 ? (
    <ConfiguredAssemblyWorkspace key={session.epoch} initialDocument={session.document} initialPath={session.path}
      initialSaved={session.saved} skipInitialRecoveryWrite={session.skipInitialRecoveryWrite} onOpenDocument={replaceDocument} />
  ) : session.document.version === 2 ? (
    <AssemblyWorkspace key={session.epoch} initialDocument={session.document} initialPath={session.path}
      initialSaved={session.saved} onOpenPart={replaceDocument} onOpenConfigured={replaceDocument} />
  ) : (
    <PartWorkspace key={session.epoch} initialDocument={session.document} initialPath={session.path}
      initialSaved={session.saved} skipInitialRecoveryWrite={session.skipInitialRecoveryWrite} onOpenAssembly={replaceDocument} />
  );
}

interface PartWorkspaceProps {
  initialDocument: Document;
  initialPath?: string;
  initialSaved?: string;
  skipInitialRecoveryWrite?: boolean;
  onOpenAssembly: (document: AssemblyDocument | AssemblyConfiguredDocument, path?: string, saved?: string) => void;
}
function PartWorkspace({ initialDocument, initialPath, initialSaved, skipInitialRecoveryWrite = false, onOpenAssembly }: PartWorkspaceProps) {
  const newDocumentDialog = useNewDocumentDialog(), newDocumentRequest = useRef(false);
  const [doc, setDoc] = useState<Document>(() => validateDocument(initialDocument));
  const history = useRef<DocumentHistory | null>(null);
  if (!history.current) history.current = new DocumentHistory(doc);
  const [model, setModel] = useState<CadResult | null>(null),
    [busy, setBusy] = useState(true),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [builtFeatures, setBuiltFeatures] = useState<Feature[] | null>(null);
  const [edgeSelection, setEdgeSelection] = useState<EdgeReference[]>([]);
  const [selectionMode, setSelectionMode] = useState<PartSelectionMode>(
    "auto",
  );
  const [faceSelection, setFaceSelection] = useState<PickableFace | null>(null);
  // Ordered presentation references are bound to the visible native result.
  // They neither enter feature parameters nor document history.
  const [normalSelection, updateNormalSelection] = useState<{
    document: Document; model: CadResult | null; face: PickableFace | null;
    selected: string | null; references: PartViewReference[];
  } | null>(null);
  const normalSelectionRef = useRef(normalSelection);
  const setNormalSelection = (value: typeof normalSelection) => { normalSelectionRef.current = value; updateNormalSelection(value); };
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
  const [sourceBuiltFeatures, setSourceBuiltFeatures] = useState<Feature[] | null>(null);
  const [bodySelection, setBodySelection] = useState<BodyReference[]>([]);
  const [bodyCatalogOpen, setBodyCatalogOpen] = useState(true);
  const bodyCatalogButton = useRef<HTMLButtonElement>(null);
  const bodyCatalogContent = useRef<HTMLDivElement>(null);
  const revealedUnavailableBodies = useRef("");
  const [bodyPicking, setBodyPicking] = useState(false);
  const bodyOutputId = useRef("");
  const [sourceLoading, setSourceLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Feature | null>(null),
    [plane, setPlane] = useState<Plane>("XY");
  // A feature started from a new or unused sketch is a reversible preview. The sketch
  // stays out of recovery/history until acceptance and resumes on Cancel.
  const [stagedSketch, setStagedSketch] = useState<SketchFeature | null>(null);
  const [featureMenu, setFeatureMenu] = useState<{ requestId: string; featureId: string; parentId?: string; point: { x: number; y: number }; origin: HTMLElement } | null>(null);
  type ViewportPopup = { requestId: string; target: PartContextTarget; document: Document; model: CadResult | null;
    selection: string; epoch: number; point: { x: number; y: number }; origin: HTMLElement };
  const [viewportPopup, setViewportPopup] = useState<ViewportPopup | null>(null);
  const viewportPopupAuthority = useRef(viewportPopup); viewportPopupAuthority.current = viewportPopup;
  const invalidateViewportPopup = () => { viewportPopupAuthority.current = null; setViewportPopup(null); };
  const [expandedFeatureIds, setExpandedFeatureIds] = useState<ReadonlySet<string>>(() => new Set());
  const treeElement = useRef<HTMLDivElement>(null);
  const selectedTreeOccurrence = useRef<{ featureId: string; parentId?: string } | null>(null);
  const editTreeReturn = useRef<{ featureId: string; parentId?: string } | null>(null);
  useEffect(() => { setFeatureMenu(null); }, [doc, editing]);
  const operationDocument = useMemo(() => stagedSketch ? stagePartSketch(doc, stagedSketch) : doc, [doc, stagedSketch]);
  const [tab, setTab] = useState("Operaciones"),
    [display, setDisplay] = useState<"shaded" | "edges" | "wire">("edges"),
    [grid, setGrid] = useState(false);
  const viewHistory = useViewHistory();
  const [view, setView] = useState<ViewRequest>({
      name: "iso",
      stamp: 0,
    }),
    [sketchTool, setSketchTool] = useState<SketchTool>("rectangle");
  const [sketchSelection, setSketchSelection] = useState<SketchSelection[]>([]);
  const [chamferPreview, setChamferPreview] = useState<ChamferPlan | null>(null);
  const [filletPreview, setFilletPreview] = useState<FilletPlan | FilletBatchPlan | null>(null);
  const [mirrorPreview, setMirrorPreview] = useState<MirrorPlan | null>(null);
  const [offsetPreview, setOffsetPreview] = useState<OffsetPlan | null>(null);
  const [mirrorAxisId, setMirrorAxisId] = useState("");
  const [mirrorPickingAxis, setMirrorPickingAxis] = useState(false);
  const [previousFilletId, setPreviousFilletId] = useState<string | null>(null);
  const filletSessionIds = useRef<string[]>([]);
  const filletSelectionCheck = useRef<((selection: SketchSelection[]) => string | null) | null>(null);
  const [sketchPast, setSketchPast] = useState<SketchFeature[]>([]);
  const [sketchFuture, setSketchFuture] = useState<SketchFeature[]>([]);
  const [sketchInspector, setSketchInspector] = useState<{
    name: "dimensions" | "relations";
    stamp: number;
  }>({ name: "dimensions", stamp: 0 });
  const [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [toastError, setToastError] = useState(false),
    [panel, setPanel] = useState<"design" | "properties" | null>(null),
    [showHelp, setShowHelp] = useState(false),
    [rename, setRename] = useState(false),
    [discardOpen, setDiscardOpen] = useState(false);
  const [filePath, setFilePath] = useState<string | undefined>(initialPath),
    [saved, setSaved] = useState(initialSaved ?? ""),
    [exporting, setExporting] = useState(false),
    [importing, setImporting] = useState(false),
    [treeOpen, setTreeOpen] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const stepInput = useRef<HTMLInputElement>(null);
  const structuralInput = useRef<HTMLInputElement>(null);
  const structuralRead = useRef<{resolve:(file:StepFile|null)=>void;reject:(error:unknown)=>void}|null>(null);
  useEffect(() => {
    const input = structuralInput.current;
    const cancel = () => { const pending = structuralRead.current; structuralRead.current = null; pending?.resolve(null); };
    input?.addEventListener('cancel', cancel);
    return () => { input?.removeEventListener('cancel', cancel); cancel(); };
  }, []);
  const fileOperation = useRef(false);
  const discardDecision = useRef<((accepted: boolean) => void) | null>(null);
  const discardDialog = useRef<HTMLDivElement>(null);
  const docRef = useRef(doc);
  const editingRef = useRef(editing);
  const documentEpoch = useRef(0);
  const mounted = useRef(true);
  type ReplacementSource = { document: Document; editing: Feature | null; epoch: number };
  const browserOpenSource = useRef<ReplacementSource | null>(null);
  editingRef.current = editing;
  docRef.current = doc;
  const selectedFeature = doc.features.find((f) => f.id === selected);
  const selectedFaceFeatureName = faceSelection
    ? doc.features.find(feature => feature.id === faceSelection.ref.sourceFeatureId)?.name ?? ""
    : "";
  const modelSelectionDtos = useMemo(() => bodySelectionDtos(model), [model]);
  const sourceSelectionDtos = useMemo(() => bodySelectionDtos(sourceModel), [sourceModel]);
  const sourceOperationDtos = useMemo(() => {
    if (isEdgeFinish(editing) || isFaceOperation(editing)) {
      const scope = editing.bodyScope ? [editing.bodyScope] : sourceModel?.bodyCatalogActive ? [] : undefined;
      return bodySelectionDtos(sourceModel, scope);
    }
    return bodySelectionDtos(sourceModel);
  }, [sourceModel, editing]);
  const modelFaceSelection = useMemo(() => createFaceSelectionIndex(modelSelectionDtos.faces), [modelSelectionDtos]);
  const modelEdgeSelection = useMemo(() => createEdgeSelectionIndex(modelSelectionDtos.edges), [modelSelectionDtos]);
  const sourceFaceSelection = useMemo(() => createFaceSelectionIndex(sourceSelectionDtos.faces), [sourceSelectionDtos]);
  const sourceOperationFaceSelection = useMemo(() => createFaceSelectionIndex(sourceOperationDtos.faces), [sourceOperationDtos]);
  const sourceEdgeSelection = useMemo(() => createEdgeSelectionIndex(sourceOperationDtos.edges), [sourceOperationDtos]);
  useEffect(() => {
    if (editing) return;
    setFaceSelection((previous) =>
      previous
        ? (modelFaceSelection.find(previous.ref) ?? null)
        : null,
    );
  }, [modelFaceSelection, editing]);
  // A legacy sketch is displayed as entities during the tool, but conversion
  // enters history only together with a successfully applied operation.
  const toolConvertedProfile = useMemo(() =>
    (sketchTool === "fillet" || sketchTool === "mirror" || sketchTool === "offset") && editing?.type === "sketch" && editing.profile.kind !== "entities"
      ? convertProfile(editing.profile) : null,
  [sketchTool === "fillet" || sketchTool === "mirror" || sketchTool === "offset", editing?.type === "sketch" ? editing.profile : null]);
  const entityProfile =
    editing?.type === "sketch" && editing.profile.kind === "entities"
      ? editing.profile
      : toolConvertedProfile;
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
  const sourceFeatures = useMemo(() => {
    if (!editing || !["fillet", "chamfer", "mirror", "shell", "draft", "extrude", "cut", "hole", "revolve", "revolvedCut", "sweep", "loft", "combine"].includes(editing.type)
      && !isRepetition(editing)) return null;
    const index = operationDocument.features.findIndex(feature => feature.id === editing.id);
    return operationDocument.features.slice(0, index < 0 ? operationDocument.features.length : index);
  }, [operationDocument.features, editing?.id, editing?.type]);
  const bodyCommand = useMemo(() => {
    if (!editing || !isBodyCommandFeature(editing) || sourceLoading || !sourceModel || sourceBuiltFeatures !== sourceFeatures) return null;
    if (sourceModel.featureErrors.length) return { accepted: false as const, message: "Reconstruye los cuerpos de origen antes de continuar." };
    return prepareBodyCommand({ document: operationDocument, feature: editing, selection: bodySelection,
      catalog: { active: sourceModel.bodyCatalogActive === true, bodies: sourceModel.bodies ?? [] } });
  }, [operationDocument, editing, bodySelection, sourceModel, sourceLoading, sourceBuiltFeatures, sourceFeatures]);
  const bodyPlan = bodyCommand?.accepted ? bodyCommand.plan : null;
  const effectiveFeatures = useMemo(() => {
    if (bodyPlan) return bodyPlan.previewFeatures;
    if (sourceFeatures && editing?.type === "extrude" && editing.bodyOperation?.mode === "new"
      && editing.endCondition && 'baseFeatureId' in editing.endCondition) return sourceFeatures;
    if (!editing) return operationDocument.features;
    if (editing.type === "sketch") {
      const complete = unusedPartSketchPreview(operationDocument, editing);
      if (complete) return complete;
    }
    const index = operationDocument.features.findIndex(
      (feature) => feature.id === editing.id,
    );
    // Editing rolls the body back to this feature. Following operations rebuild
    // after acceptance and can report lost references without blocking the edit.
    return [
      ...operationDocument.features.slice(0, index < 0 ? operationDocument.features.length : index),
      editing,
    ];
  }, [operationDocument.features, editing, bodyPlan, sourceFeatures]);
  const finishEditing = isEdgeFinish(editing) ? editing : null;
  const mirrorEditing = editing?.type === "mirror" ? editing : null;
  const faceEditing = isFaceOperation(editing) ? editing : null;
  const extrudeEditing =
    editing?.type === "extrude" || editing?.type === "cut" ? editing : null;
  const holeEditing = editing?.type === "hole" ? editing : null;
  const pickingFinish = !!finishEditing && !finishPreview;
  const pickingMirror = !!mirrorEditing && pickingSupport;
  const pickingFaceOperation =
    !!faceEditing && (!facePreview || pickingSupport);
  const pickingExtrude =
    !!extrudeEditing &&
    extrudeEditing.endCondition?.kind === "upToSurface" &&
    pickingEndFace;
  const pickingHole = !!holeEditing && pickingSupport;
  const viewportSelectionMode: PartSelectionMode = bodyPicking ? 'body'
    : pickingSupport || pickingFaceOperation || pickingExtrude || pickingHole ? 'face'
      : pickingFinish ? 'edge' : editing ? 'body' : selectionMode;
  const placingHoles =
    !!holeEditing && holeSection === "positions" && !pickingHole;
  const visibleBase =
    bodyPicking ||
    pickingFinish ||
    pickingMirror ||
    pickingFaceOperation ||
    pickingExtrude ||
    pickingHole
      ? sourceModel
      : model;
  const visibleModel = useMemo(() => {
    if (!visibleBase) return null;
    const selection = pickingFinish || pickingFaceOperation && !pickingSupport
      ? sourceOperationDtos : visibleBase === sourceModel ? sourceSelectionDtos : modelSelectionDtos;
    return { ...visibleBase, faces: selection.faces, edges: selection.edges };
  }, [visibleBase, pickingFinish, pickingFaceOperation, pickingSupport, sourceOperationDtos, sourceModel, sourceSelectionDtos, modelSelectionDtos]);
  const operationFaces =
    faceEditing?.type === "shell"
      ? faceEditing.removedFaces
      : (faceEditing?.faces ?? []);
  const selectedEdges = finishEditing
    ? finishEditing.selection.mode === "selected"
      ? finishEditing.selection.edges
      : sourceOperationDtos.edges.map((edge) => edge.ref)
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
  const serializedDocument = useMemo(() => serializeDocument(doc), [doc]);
  const preservedRecovery = useRef<string | null>(skipInitialRecoveryWrite ? serializedDocument : null);
  const dirty = serializedDocument !== saved || editing !== null;
  const previewCurrent = builtFeatures === effectiveFeatures;
  const unavailableBodySelection = bodySelection.filter(reference =>
    !model?.bodies?.some(body => sameBodyReference(body.ref, reference)));
  const unavailableBodySelectionKey = JSON.stringify(unavailableBodySelection.map(reference =>
    [reference.bodyId, reference.sourceFeatureId]));
  // Reveal newly unavailable browsing selections once; manual collapse stays respected.
  useLayoutEffect(() => {
    if (editing || busy || !previewCurrent || !model?.bodyCatalogActive) return;
    if (unavailableBodySelection.length && revealedUnavailableBodies.current !== unavailableBodySelectionKey)
      setBodyCatalogOpen(true);
    revealedUnavailableBodies.current = unavailableBodySelectionKey;
  }, [editing, busy, previewCurrent, model?.bodyCatalogActive, unavailableBodySelectionKey, unavailableBodySelection.length]);
  const toggleBodyCatalog = () => {
    if (bodyCatalogOpen && bodyCatalogContent.current?.contains(document.activeElement))
      bodyCatalogButton.current?.focus();
    setBodyCatalogOpen(value => !value);
  };
  const editingResolved =
    !editing ||
    editing.suppressed ||
    (editing.type === "sketch"
      ? model?.sketches?.some((sketch) => sketch.id === editing.id)
      : editing.type === "plane"
        ? model?.planes?.some((reference) => reference.id === editing.id)
        : editing.type === "combine" && model?.bodyCatalogActive
          ? model.bodies?.some(body => body.ref.sourceFeatureId === editing.id)
          : model?.faces?.some(
            (face) => face.ref.sourceFeatureId === editing.id,
          ));
  const canAccept =
    !!editing &&
    !!editingResolved &&
    (!editing || !isBodyCommandFeature(editing) || (!!bodyPlan && !bodyPicking)) &&
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
    (editing.type !== "sketch" || sketchTool !== "mirror" || !!mirrorPreview?.changed) &&
    (editing.type !== "sketch" || sketchTool !== "offset" || !!offsetPreview?.changed) &&
    model.featureErrors.length === 0;
  const canContinueSketch = editing?.type === "sketch" && !editing.suppressed && canAccept && !pickingSupport
    && canContinuePartSketch(doc, editing)
    && !["chamfer", "fillet", "mirror", "offset"].includes(sketchTool);
  const canStartProfileFeature = (!editing || canContinueSketch) && ready && !busy && previewCurrent
    && !!model && !error && model.featureErrors.length === 0 && !importing && !exporting;
  const canExport =
    !editing &&
    ready &&
    !busy &&
    previewCurrent &&
    !!model?.vertices.length &&
    !error &&
    !exporting &&
    !importing;
  const canCreateAssemblyFromPart = !editing && !stagedSketch && ready && !busy
    && previewCurrent && builtFeatures === doc.features && !!model?.vertices.length
    && !error && model.featureErrors.length === 0 && !importing && !exporting && !discardOpen;
  const notify = (message: string, isError = false) => {
    setToast(message);
    setToastError(isError);
  };
  const requireFinishedEdit = () => {
    if (!editing) return true;
    notify("Acepta o cancela la operación en curso antes de continuar.");
    return false;
  };
  const focusTreeOccurrence = (featureId: string, parentId?: string) => {
    const key = treeOccurrenceKey(featureId, parentId);
    const target = Array.from(treeElement.current?.querySelectorAll<HTMLElement>(".tree-row[data-tree-occurrence]") ?? [])
      .find(element => element.dataset.treeOccurrence === key);
    target?.focus();
    return !!target;
  };
  // The PropertyManager replaces the tree while editing. Restore the exact shared
  // profile occurrence after its row mounts again, including an unused profile
  // that acquired an owner when its staged operation was accepted.
  useLayoutEffect(() => {
    const destination = editTreeReturn.current;
    if (editing || !destination) return;
    const feature = doc.features.find(candidate => candidate.id === destination.featureId);
    if (!feature) { editTreeReturn.current = null; return; }
    const owners = feature.type === "sketch" ? revealPartSketchOwners(doc.features, feature.id, destination.parentId) : [];
    const parentId = owners[0];
    if (!treeOpen || query || owners.some(id => !expandedFeatureIds.has(id))) {
      setTreeOpen(true);
      setQuery("");
      if (owners.some(id => !expandedFeatureIds.has(id)))
        setExpandedFeatureIds(previous => new Set([...previous, ...owners]));
      return;
    }
    if (focusTreeOccurrence(feature.id, parentId)) editTreeReturn.current = null;
  });
  const editFeature = (feature: Feature, preferredOwnerId?: string) => {
    invalidateViewportPopup();
    setPickingEndFace(false);
    if (!requireFinishedEdit()) return;
    const previousOccurrence = selectedTreeOccurrence.current;
    const preferred = preferredOwnerId ?? (previousOccurrence?.featureId === feature.id ? previousOccurrence.parentId : undefined);
    const owners = feature.type === "sketch" ? revealPartSketchOwners(doc.features, feature.id, preferred) : [];
    const occurrence = { featureId: feature.id, parentId: owners[0] };
    editTreeReturn.current = occurrence;
    selectedTreeOccurrence.current = occurrence;
    setSelected(feature.id);
    setTreeOpen(true);
    setQuery("");
    if (owners.length) setExpandedFeatureIds(previous => new Set([...previous, ...owners]));
    setHoleSection("type");
    setSelectedHolePosition(
      feature.type === "hole" ? (feature.positions[0]?.id ?? null) : null,
    );
    setEditing(structuredClone(feature));
    bodyOutputId.current = createdBodyIds(feature)[0] ?? crypto.randomUUID();
    setBodySelection(isRepetition(feature) && feature.featurePattern
      ? featureCurrentBodyReferences(feature)
      : isRepetition(feature) && feature.source.mode === 'bodies'
        ? feature.source.bodies.map(ref => ({ ...ref })) : featureBodyReferences(feature));
    setBodyPicking(feature.type === "combine");
    setFinishPreview(false);
    setFacePreview(false);
    setEdgeSelection([]);
    setFaceSelection(null);
    setPickingSupport(false);
    setSelectionMode("auto");
    setTab(feature.type === "sketch" ? "Croquis" : "Operaciones");
    if (feature.type === "sketch") {
      setSketchTool("select");
      setSketchSelection([]);
      setSketchPast([]);
      setSketchFuture([]);
    }
  };
  const apply = (next: Document) => {
    invalidateViewportPopup();
    setDoc(history.current!.apply(next));
    setError("");
  };
  const [sketchFitStamp, setSketchFitStamp] = useState(0);
  const viewIs2D = editing?.type === 'sketch' && !pickingSupport || placingHoles;
  const normalReferences = useMemo((): PartViewReference[] | null => {
    if (edgeSelection.length || bodySelection.length) return null;
    if (normalSelection && normalSelection.face === faceSelection && normalSelection.selected === selected)
      return normalSelection.document === doc && normalSelection.model === visibleBase ? normalSelection.references : null;
    if (faceSelection) return [{ kind: 'face', face: faceSelection.ref }];
    if (selectedFeature) return [{ kind: 'feature', id: selectedFeature.id }];
    if (selected === 'XY' || selected === 'XZ' || selected === 'YZ') return [{ kind: 'principal', plane: selected }];
    return selected ? null : [];
  }, [normalSelection, faceSelection, selected, selectedFeature, doc, visibleBase, edgeSelection.length, bodySelection.length]);
  const normalTarget = useMemo(() => normalReferences && partNormalToTarget(normalReferences, visibleBase, operationDocument.features),
    [normalReferences, visibleBase, operationDocument.features]);
  const canNormal = !viewHistory.navigating && !busy && previewCurrent && !sourceLoading && !importing && !exporting
    && !discardOpen && !newDocumentDialog.pending() && (!!viewIs2D || !!normalTarget && validateNormalToTarget(normalTarget));
  const adoptNamedViewMetadata = (next: Document) => {
    const before = docRef.current;
    if (!sameDocumentExceptNamedViews(before, next)) throw Error('Sólo se puede modificar el catálogo de vistas.');
    const owned = { ...next, features: before.features };
    const selection = normalSelectionRef.current;
    if (selection?.document === before && selection.model === visibleBase)
      setNormalSelection({ ...selection, document: owned });
    docRef.current = owned; setDoc(owned); return owned;
  };
  const namedViews = useNamedDocumentViews({ document: doc, identity: documentEpoch.current, scene: model, history: viewHistory,
    isCurrent: () => docRef.current === doc && !fileOperation.current,
    blocked: !!editing || !!stagedSketch || busy || !previewCurrent || !model || sourceLoading || importing || exporting
      || fileOperation.current || discardOpen || rename || showHelp || newDocumentDialog.pending(),
    commit: next => {
      if (docRef.current !== doc || !sameDocumentExceptNamedViews(doc, next)) throw Error('El documento ha cambiado.');
      return adoptNamedViewMetadata(history.current!.apply(next));
    },
    recall: savedView => setView(previous => ({ name: 'named', stamp: previous.stamp + 1, view: savedView })),
  });
  const selectViewReference = (reference: PartViewReference, additive = false) => {
    invalidateViewportPopup();
    if (editing || busy || !previewCurrent || docRef.current !== doc || normalSelectionRef.current !== normalSelection) return;
    if (additive && normalReferences === null) return;
    const references = togglePartViewReference(normalReferences ?? [], reference, additive);
    const last = references.at(-1);
    const face = last?.kind === 'face' ? modelFaceSelection.findPrimary(last.face) ?? null : null;
    const selected = last?.kind === 'feature' ? last.id : last?.kind === 'principal' ? last.plane : null;
    if (last?.kind === 'face' && !face) return;
    setNormalSelection({ document: doc, model: visibleBase, face, selected, references });
    setFaceSelection(face); setSelected(selected); setEdgeSelection([]); setBodySelection([]);
    if (last?.kind === 'principal') setPlane(last.plane);
  };
  const changeView = (name: ViewName) => {
    invalidateViewportPopup();
    if (namedViews.isOpen || viewHistory.navigating) return;
    if (name === 'previous' && (!viewHistory.canPrevious || viewIs2D)) return;
    if (viewIs2D) { if (name === 'fit' || name === 'normal' && canNormal) setSketchFitStamp(stamp => stamp + 1); return; }
    if (name === 'normal') {
      if (!canNormal || !normalTarget || normalSelectionRef.current !== normalSelection) {
        notify('Selecciona una cara o plano actual, o dos planos no paralelos para definir qué queda arriba.', true); return;
      }
      setView(previous => ({ name: 'normal', target: structuredClone(normalTarget), stamp: previous.stamp + 1 })); return;
    }
    setView(previous => ({ name, stamp: previous.stamp + 1 }));
  };
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
      setSourceBuiltFeatures(null);
      setSourceLoading(false);
      return;
    }
    let active = true;
    setSourceLoading(true);
    setSourceModel(null);
    setSourceBuiltFeatures(null);
    buildModel(sourceFeatures)
      .then((result) => {
        if (active) {
          setSourceModel(result);
          setSourceBuiltFeatures(sourceFeatures);
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
    if (preservedRecovery.current === serializedDocument) return;
    preservedRecovery.current = null;
    try {
      writeCadRecovery(localStorage, doc);
    } catch {
      notify(
        "No se pudo guardar la recuperación local. Guarda la pieza en un archivo.",
      );
    }
  }, [doc, serializedDocument]);
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
    () => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        browserOpenSource.current = null;
        const resolve = discardDecision.current;
        discardDecision.current = null;
        resolve?.(false);
      };
    },
    [],
  );
  const reset = (next: Document, path?: string, markSaved = false) => {
    namedViews.close();
    documentEpoch.current++;
    viewHistory.reset();
    preservedRecovery.current = null;
    browserOpenSource.current = null;
    editTreeReturn.current = null;
    selectedTreeOccurrence.current = null;
    setExpandedFeatureIds(new Set());
    setBodyCatalogOpen(true);
    revealedUnavailableBodies.current = "";
    setQuery("");
    setTreeOpen(true);
    setPickingEndFace(false);
    setHoleSection("type");
    setSelectedHolePosition(null);
    setDoc(history.current!.reset(next));
    setModel(null);
    setBuiltFeatures(null);
    setEditing(null);
    setStagedSketch(null);
    setSelected(null);
    setSelectionMode("auto");
    setEdgeSelection([]);
    setFaceSelection(null);
    setPickingSupport(false);
    setSourceModel(null);
    setFilePath(path);
    setSaved(markSaved ? serializeDocument(next) : "");
    setError("");
    setView(previous => ({ name: "iso", stamp: previous.stamp + 1 }));
  };
  const finishDiscard = (accepted: boolean) => {
    const resolve = discardDecision.current;
    discardDecision.current = null;
    setDiscardOpen(false);
    resolve?.(accepted);
  };
  const canReplace = async (ownsFileOperation = false): Promise<boolean> => {
    // A second shortcut must not queue another document replacement.
    if (discardDecision.current) return false;
    if (fileOperation.current && !ownsFileOperation) {
      notify("Espera a que termine la operación de archivo actual.");
      return false;
    }
    if (!dirty) return true;
    return new Promise<boolean>((resolve) => {
      discardDecision.current = resolve;
      setDiscardOpen(true);
    });
  };
  const newDocumentBlocked = busy || !!editing || !!stagedSketch || importing || exporting || discardOpen;
  const newDocumentUnsafe = busy || !!editing || !!stagedSketch || importing || exporting;
  const newDocumentUnsafeRef = useRef(newDocumentUnsafe); newDocumentUnsafeRef.current = newDocumentUnsafe;
  const newDocumentBlockedRef = useRef(newDocumentBlocked); newDocumentBlockedRef.current = newDocumentBlocked;
  const newDoc = async () => {
    if (newDocumentRequest.current || newDocumentBlockedRef.current || fileOperation.current || discardDecision.current) return;
    newDocumentRequest.current = true;
    const source = replacementSource();
    const fresh = () => isReplacementCurrent(source) && !newDocumentUnsafeRef.current && !fileOperation.current;
    try {
      await requestNewDocument({ choose: newDocumentDialog.choose, current: fresh, confirm: () => canReplace(), create: kind => {
        if (kind === 'part') reset(createDocument("Pieza1"));
        else onOpenAssembly(createEmptyAssembly());
      } });
    } catch (reason) { if (mounted.current) notify((reason as Error).message, true); }
    finally { newDocumentRequest.current = false; }
  };
  const replacementSource = (): ReplacementSource => ({ document: docRef.current, editing: editingRef.current, epoch: documentEpoch.current });
  const isReplacementCurrent = (source: ReplacementSource) => mounted.current && source.epoch === documentEpoch.current &&
    source.document === docRef.current && source.editing === editingRef.current;
  const openReplacement = (content: string, path: string | undefined, source: ReplacementSource) => {
    const next = parseCadDocument(content);
    const saved = serializeCadDocument(next);
    if (!isReplacementCurrent(source)) throw new Error("El documento cambió durante la apertura. Vuelve a abrir el archivo.");
    if (next.version === 2 || next.version === 3) onOpenAssembly(next, path, saved);
    else reset(next, path, true);
  };
  const newAssembly = async () => {
    if (newDocumentRequest.current || newDocumentBlockedRef.current || fileOperation.current || discardDecision.current) return;
    newDocumentRequest.current = true;
    const source = replacementSource();
    try {
      if (!(await canReplace()) || !isReplacementCurrent(source) || newDocumentUnsafeRef.current || fileOperation.current) return;
      onOpenAssembly(createEmptyAssembly());
    } catch (reason) { if (mounted.current) notify((reason as Error).message, true); }
    finally { newDocumentRequest.current = false; }
  };
  const newAssemblyFromPart = () => {
    if (!requireFinishedEdit()) return;
    if (fileOperation.current || discardDecision.current) {
      notify("Termina la operación de archivo actual antes de crear el ensamblaje.");
      return;
    }
    if (!mounted.current || !canCreateAssemblyFromPart || docRef.current !== doc || editingRef.current) return;
    // Synchronous snapshot transfer: no pending editor, file read or stale build
    // can replace the committed part. The new assembly owns its own Save path.
    try { onOpenAssembly(createAssemblyFromPart(docRef.current)); }
    catch (reason) { notify((reason as Error).message, true); }
  };
  const loadDemo = async () => {
    if (await canReplace()) reset(createDemoDocument());
  };
  const loadConstrainedDemo = async () => {
    if (await canReplace()) reset(createConstrainedPlateDocument());
  };
  const loadPartSequenceDemo = async () => {
    if (await canReplace()) reset(createPartSequenceDocument());
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
  const loadFilletBatchDemo = async () => {
    if (await canReplace()) reset(createFilletBatchDocument());
  };
  const loadSketchMirrorDemo = async (kind: "lines" | "arc") => {
    if (await canReplace()) reset(kind === "lines" ? createSketchMirrorDocument() : createSketchMirrorArcDocument());
  };
  const loadSketchOffsetDemo = async (kind: "rectangle" | "circle" | "concave") => {
    if (await canReplace()) reset(createSketchOffsetDocument(kind));
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
    if (namedViews.isOpen) return;
    if (!requireFinishedEdit()) return;
    if (fileOperation.current) {
      notify("Espera a que termine la operación de archivo actual.");
      return;
    }
    fileOperation.current = true;
    const snapshot = serializedDocument;
    const epoch = documentEpoch.current;
    try {
      if (window.solidflow) {
        const path = await window.solidflow.saveDocument(
          snapshot,
          doc.name,
          saveAs ? undefined : filePath,
        );
        if (!path) return;
        if (!mounted.current || documentEpoch.current !== epoch) return;
        setFilePath(path);
      } else
        download(
          new Blob([snapshot], { type: "application/json" }),
          doc.name + ".solidflow",
        );
      if (!mounted.current || documentEpoch.current !== epoch) return;
      setSaved(snapshot);
      notify("Pieza guardada");
    } catch (e) {
      if (mounted.current) notify((e as Error).message, true);
    } finally {
      fileOperation.current = false;
    }
  };
  const openDoc = async () => {
    const source = replacementSource();
    if (!(await canReplace()) || !isReplacementCurrent(source)) return;
    fileOperation.current = true;
    try {
      if (window.solidflow) {
        const file = await window.solidflow.openDocument();
        if (file) openReplacement(file.content, file.path, source);
      } else {
        browserOpenSource.current = source;
        fileInput.current?.click();
      }
    } catch (e) {
      if (mounted.current) notify((e as Error).message, true);
    } finally {
      fileOperation.current = false;
    }
  };
  const performStepImport = async (read: () => Promise<StepFile | null>) => {
    if (!requireFinishedEdit()) return;
    if (fileOperation.current) {
      notify("Espera a que termine la operación de archivo actual.");
      return;
    }
    if (!ready) {
      notify("Espera a que se inicie el motor CAD.");
      return;
    }
    fileOperation.current = true;
    setImporting(true);
    try {
      const result = await importStepPart({
        current: () => ({ document: docRef.current, editing: editingRef.current }),
        read,
        build: buildModel,
        confirm: () => canReplace(true),
        commit: next => reset(next),
      });
      if (result === "imported") notify("Sólido STEP importado. Guarda la pieza para conservarlo.");
      if (result === "stale") notify("La pieza cambió durante la importación. Vuelve a seleccionar el STEP.");
    } catch (reason) {
      notify((reason as Error).message, true);
    } finally {
      setImporting(false);
      fileOperation.current = false;
    }
  };
  const selectStructuralStep = async () => {
    if (!requireFinishedEdit() || fileOperation.current || !ready) return;
    const epoch = documentEpoch.current, original = serializeDocument(docRef.current), editing = editingRef.current;
    const fresh = () => mounted.current && documentEpoch.current === epoch && editingRef.current === editing && serializeDocument(docRef.current) === original;
    fileOperation.current = true; setImporting(true);
    try {
      const result = await importStructuralStep({ fresh, prepare: importAssemblyStep,
        read: window.solidflow ? () => window.solidflow!.importStep() : () => new Promise<StepFile|null>((resolve,reject) => { structuralRead.current={resolve,reject}; structuralInput.current?.click(); }),
        confirm: () => canReplace(true), commit: next => onOpenAssembly(next),
      });
      if (fresh() && result === 'stale') notify('La pieza cambió durante la importación estructural.');
    } catch(reason) { if(fresh()) notify((reason as Error).message,true); }
    finally { if(mounted.current && documentEpoch.current===epoch) {fileOperation.current=false;setImporting(false);} }
  };
  const selectStep = () => {
    if (!requireFinishedEdit()) return;
    if (fileOperation.current) {
      notify("Espera a que termine la operación de archivo actual.");
      return;
    }
    if (window.solidflow) void performStepImport(() => window.solidflow!.importStep());
    else stepInput.current?.click();
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
      if (namedViews.isOpen) return;
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
      const next = history.current!.undo();
      if (sameDocumentExceptNamedViews(docRef.current, next)) { adoptNamedViewMetadata(next); return; }
      setDoc(next);
      setSelected(null);
      setError("");
    },
    redo = () => {
      if (namedViews.isOpen) return;
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
      const next = history.current!.redo();
      if (sameDocumentExceptNamedViews(docRef.current, next)) { adoptNamedViewMetadata(next); return; }
      setDoc(next);
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
    setSelectionMode("auto");
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
    const face = faceSelection ? modelFaceSelection.find(faceSelection.ref) : undefined;
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
    setSelectionMode("auto");
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
  const selectFace = (face: PickableFace | null, additive = false) => {
    if (
      (pickingMirror ||
        pickingFaceOperation ||
        pickingExtrude ||
        pickingHole) &&
      sourceLoading
    )
      return;
    const visibleFaces = faceEditing && !facePreview && !pickingSupport
      ? sourceOperationFaceSelection
      : pickingMirror || pickingFaceOperation || pickingExtrude || pickingHole
        ? sourceFaceSelection : modelFaceSelection;
    const currentFace = face ? visibleFaces.findPrimary(face.ref) : undefined;
    if (face && !currentFace) return;
    if (pickingHole) {
      if (!currentFace) return;
      if (!currentFace.frame) {
        notify(
          "Selecciona una cara plana para colocar los centros del taladro.",
          true,
        );
        return;
      }
      changeSupport({ kind: "face", face: currentFace.ref });
      return;
    }
    if (pickingExtrude) {
      if (currentFace) changeEndTarget({ kind: "face", face: currentFace.ref });
      return;
    }
    if (faceEditing && !facePreview && !pickingSupport) {
      if (!currentFace) return;
      const faces = sourceOperationFaceSelection.toggle(operationFaces, currentFace.ref);
      if (!faces) return;
      if (faces.length > operationFaces.length && faces.length > 256) {
        notify("Puedes seleccionar hasta 256 caras en esta operación.", true);
        return;
      }
      changeDraft(
        faceEditing.type === "shell" ? { removedFaces: faces } : { faces },
      );
      return;
    }
    if (busy || !previewCurrent) return;
    if (pickingSupport) {
      if (!currentFace?.frame) {
        if (currentFace)
          notify("Esta cara es curva. Selecciona una cara plana.", true);
        return;
      }
      changeSupport({ kind: "face", face: currentFace.ref });
    } else {
      if (!editing && currentFace) selectViewReference({ kind: 'face', face: currentFace.ref }, additive);
      else {
        setNormalSelection(null); setFaceSelection(currentFace ?? null);
        if (!editing) setBodySelection([]);
        setSelected(null); setEdgeSelection([]);
      }
      if (currentFace && !currentFace.frame)
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
    const explicitBodies = model?.bodyCatalogActive === true || !doc.features.some(feature => feature.type !== "sketch" && feature.type !== "plane" && !isBodyCommandFeature(feature));
    bodyOutputId.current = crypto.randomUUID();
    const base = {
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((feature) => feature.type === type).length + 1}`,
      suppressed: false,
      merge: !explicitBodies,
      ...(explicitBodies ? { bodyOperation: { mode: "new" as const, bodyId: bodyOutputId.current } } : {}),
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
    setBodySelection([]);
    setBodyPicking(false);
    setSelectionMode("auto");
    setFaceSelection(null);
    setEdgeSelection([]);
    setPickingSupport(false);
    setTab("Operaciones");
    setError("");
  };
  const startFeature = (type: "extrude" | "cut" | "revolve" | "revolvedCut") => {
    if (editing && !canContinueSketch) { requireFinishedEdit(); return; }
    if (!canStartProfileFeature || !model) {
      notify("Espera a que la pieza se reconstruya sin errores antes de añadir la operación.");
      return;
    }
    if (type === "revolvedCut" && !model.vertices.length) {
      notify("Crea primero un sólido antes de aplicar un corte por revolución.");
      return;
    }
    setPickingEndFace(false);
    setPickingSupport(false);
    setSelectionMode("auto");
    setEdgeSelection([]);
    setFaceSelection(null);
    const sketch =
      (canContinueSketch && editing?.type === "sketch" ? editing : undefined) ??
      (selectedSketch?.suppressed ? undefined : selectedSketch) ??
      [...doc.features]
        .reverse()
        .find((f) => f.type === "sketch" && !f.suppressed);
    if (!sketch || sketch.type !== "sketch") {
      notify("Crea o selecciona un croquis antes de añadir la operación.");
      return;
    }
    if (canContinueSketch) {
      // Admission can reject document limits. Keep that failure in the command,
      // before rendering the staged document or changing the current editor.
      try { stagePartSketch(doc, sketch); }
      catch (reason) { notify((reason as Error).message, true); return; }
      setStagedSketch(sketch);
    }
    const base = {
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((f) => f.type === type).length + 1}`,
      sketchId: sketch.id,
      suppressed: false,
    };
    const explicitBodies = model?.bodyCatalogActive === true || !doc.features.some(feature => feature.type !== "sketch" && feature.type !== "plane" && !isBodyCommandFeature(feature));
    bodyOutputId.current = crypto.randomUUID();
    const targets = explicitBodies ? initialPartTargets(model.bodies ?? [], bodySelection, sketch) : [];
    const mergeTarget = type === "extrude" && sketch.support?.kind === "face" && targets.length === 1 ? targets[0] : null;
    setBodySelection(type === "cut" || type === "revolvedCut" || mergeTarget ? targets : []);
    setBodyPicking((type === "cut" || type === "revolvedCut") && explicitBodies && !targets.length);
    if (type === "revolve") setEditing({ ...base, type, angle: 360,
      ...(explicitBodies ? { bodyOperation: { mode: "new", bodyId: bodyOutputId.current } } : {}) });
    else if (type === "revolvedCut") setEditing({ ...base, type, angle: 360,
      ...(explicitBodies ? { bodyScope: targets } : {}) });
    else if (type === "cut") setEditing({ ...base, type,
      depth: sketch.type === "sketch" && sketch.support ? -20 : 20, symmetric: false,
      ...(explicitBodies ? { bodyScope: targets } : {}) });
    else setEditing({ ...base, type, depth: 20, symmetric: false,
      ...(explicitBodies ? { bodyOperation: mergeTarget ? { mode: "merge", target: mergeTarget } : { mode: "new", bodyId: bodyOutputId.current } } : {}) });
    setTab("Operaciones");
    setError("");
  };
  const startCombine = () => {
    if (!requireFinishedEdit()) return;
    if (!canExport || !model?.bodyCatalogActive || bodySelection.length < 2 || bodySelection.some(ref => model.bodies?.filter(body => sameBodyReference(body.ref, ref)).length !== 1)) {
      notify("Selecciona al menos dos cuerpos disponibles antes de combinarlos.", true); return;
    }
    bodyOutputId.current = crypto.randomUUID();
    const feature: CombineFeature = { id: crypto.randomUUID(), type: "combine", name: `Combinar${doc.features.filter(item => item.type === "combine").length + 1}`,
      suppressed: false, operation: "add", operands: bodySelection.map(ref => ({ ...ref })), resultBodyId: bodyOutputId.current, keepTools: false };
    setEditing(feature); setBodyPicking(true); setPickingSupport(false); setPickingEndFace(false);
    setFaceSelection(null); setEdgeSelection([]); setSelectionMode("auto"); setTab("Operaciones"); setError("");
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
    let draft: RepetitionFeature;
    if (type === "linearPattern")
      draft = {
        ...common,
        type,
        first: { direction: [1, 0, 0], spacing: 20, count: 3 },
        second: null,
        secondSeedOnly: false,
        skipped: [],
      };
    else if (type === "circularPattern")
      draft = {
        ...common,
        type,
        axis: { origin: [0, 0, 0], direction: [0, 0, 1] },
        count: 6,
        angle: 360,
        equalSpacing: true,
        reversed: false,
        skipped: [],
      };
    else
      draft = {
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
      };
    if (model?.bodyCatalogActive) {
      const seeds = (bodySelection.length ? bodySelection : (model.bodies?.slice(0, 1).map(body => body.ref) ?? [])).map(ref => ({ ...ref }));
      draft = reconcileBodyPatternDraft({ ...draft, source: { mode: 'bodies', scope: 'current', bodies: seeds }, bodyPattern: { mode: 'new', instances: [] } });
      setBodySelection(seeds); setBodyPicking(true);
    }
    setEditing(draft);
    setSelectionMode("auto");
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
    if (model?.bodyCatalogActive && (bodySelection.length !== 1 || bodySelection.some(ref => model.bodies?.filter(body => sameBodyReference(body.ref, ref)).length !== 1))) { notify("Selecciona un cuerpo disponible para esta operación.", true); return; }
    const baseFeatureId = model?.bodyCatalogActive ? bodySelection[0]?.sourceFeatureId : model?.faces?.[0]?.ref.sourceFeatureId;
    if (!baseFeatureId) return;
    const targetFaces = createFaceSelectionIndex(bodySelectionDtos(model, model?.bodyCatalogActive ? bodySelection : undefined).faces);
    const currentFace = faceSelection ? targetFaces.find(faceSelection.ref) : undefined;
    const faces =
      currentFace?.ref.sourceFeatureId === baseFeatureId
        ? [currentFace.ref]
        : [];
    const common = {
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((feature) => feature.type === type).length + 1}`,
      suppressed: false,
      baseFeatureId,
      ...(model?.bodyCatalogActive ? { bodyScope: { ...bodySelection[0] } } : {}),
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
    setBodyPicking(false);
    setSelectionMode("auto");
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
    const baseFeatureId = model?.bodyCatalogActive ? bodySelection[0]?.sourceFeatureId : model?.faces?.[0]?.ref.sourceFeatureId;
    if (model?.bodyCatalogActive && (!bodySelection.length || bodySelection.some(ref => model.bodies?.filter(body => sameBodyReference(body.ref, ref)).length !== 1))) { notify("Selecciona los cuerpos disponibles que reciban el taladro.", true); return; }
    if (!baseFeatureId) return;
    const currentFace = faceSelection ? modelFaceSelection.find(faceSelection.ref) : undefined;
    const selectedFace = currentFace?.frame ? currentFace : null;
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
      ...(model?.bodyCatalogActive ? { bodyScope: bodySelection.map(ref => ({ ...ref })) } : {}),
    };
    setEditing(feature);
    setBodyPicking(false);
    setHoleSection("positions");
    setSelectedHolePosition(null);
    setPickingSupport(!selectedFace && !chosenPlane);
    setPickingEndFace(false);
    setSelectionMode("auto");
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
    if (model?.bodyCatalogActive && (bodySelection.length !== 1 || bodySelection.some(ref => model.bodies?.filter(body => sameBodyReference(body.ref, ref)).length !== 1))) { notify("Selecciona un cuerpo disponible para este acabado.", true); return; }
    const sourceId = model?.bodyCatalogActive ? bodySelection[0]?.sourceFeatureId : model?.edges[0]?.ref.sourceFeatureId;
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
    const targetEdges = createEdgeSelectionIndex(bodySelectionDtos(model, model?.bodyCatalogActive ? bodySelection : undefined).edges);
    const edges = edgeSelection.filter(
      (edge) =>
        edge.sourceFeatureId === base.id &&
        targetEdges.find(edge),
    );
    setEditing({
      id: crypto.randomUUID(),
      name: `${labels[type]}${doc.features.filter((feature) => feature.type === type).length + 1}`,
      type,
      size: 1,
      baseFeatureId: base.id,
      selection: { mode: "selected", edges },
      suppressed: false,
      ...(model?.bodyCatalogActive ? { bodyScope: { ...bodySelection[0] } } : {}),
    });
    setFinishPreview(false);
    setBodyPicking(false);
    setSelectionMode("auto");
    setSelected(null);
    setTab("Operaciones");
    setError("");
  };
  const toggleEdge = (edge: EdgeReference) => {
    invalidateViewportPopup();
    if (finishEditing) {
      if (sourceLoading) return;
      const current =
        finishEditing.selection.mode === "selected"
          ? finishEditing.selection.edges
          : sourceOperationDtos.edges.map((candidate) => candidate.ref);
      const edges = sourceEdgeSelection.toggle(current, edge);
      if (!edges) return;
      setEditing({
        ...finishEditing,
        selection: { mode: "selected", edges },
      });
      setError("");
      setFinishPreview(false);
    } else {
      if (busy || !previewCurrent) return;
      const edges = modelEdgeSelection.toggle(edgeSelection, edge);
      if (!edges) return;
      setEdgeSelection(edges);
      setFaceSelection(null);
      if (!editing) setBodySelection([]);
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
  const applySketchFillet = (plan: FilletPlan | FilletBatchPlan) => {
    if (editing?.type !== "sketch") return;
    const application = solveFilletApplication(sketchSolution, plan);
    if (!application.accepted) {
      notify(application.message, true);
      return;
    }
    changeDraft({ profile: application.solution.profile });
    setFilletPreview(null);
    const filletIds = "filletEntityIds" in plan ? plan.filletEntityIds : [plan.filletEntityId!];
    filletSessionIds.current = [...filletSessionIds.current.filter(id => !filletIds.includes(id)), ...filletIds];
    setPreviousFilletId(filletIds.at(-1) ?? null);
    setSketchSelection([]);
    notify(filletIds.length > 1
      ? `${filletIds.length} esquinas redondeadas en una operación. Selecciona otras o termina con Esc.`
      : "Redondeo aplicado. Selecciona otra esquina o termina con Esc.");
  };
  const chooseMirrorAxis = (id: string) => {
    setMirrorPreview(null);
    setMirrorAxisId(id);
    setMirrorPickingAxis(false);
    setSketchSelection(old => old.filter(item => item.kind === "entity" && item.id !== id));
  };
  const applySketchMirror = (plan: MirrorPlan) => {
    if (editing?.type !== "sketch") return;
    if (plan.axisEntityId !== mirrorAxisId ||
      JSON.stringify(plan.sourceEntityIds) !== JSON.stringify(sketchSelection.filter(s => s.kind === "entity").map(s => s.id).sort())) {
      notify("La selección ha cambiado. Revisa la vista previa de simetría.", true); return;
    }
    const application = solveMirrorApplication(sketchSolution, plan);
    if (!application.accepted) { notify(application.message, true); return; }
    changeDraft({ profile: application.solution.profile });
    setMirrorPreview(null);
    setMirrorPickingAxis(false);
    setSketchSelection([]);
    notify("Simetría aplicada. Las copias siguen las cotas de las fuentes y del eje.");
  };
  const applySketchOffset = (plan: OffsetPlan) => {
    if (editing?.type !== "sketch") return;
    if (sketchSelection.some(item => item.kind !== "entity") ||
      JSON.stringify(plan.selectedEntityIds) !== JSON.stringify(sketchSelection.map(item => item.id))) {
      notify("La selección ha cambiado. Revisa la vista previa de equidistancia.", true);
      return;
    }
    const application = solveOffsetApplication(sketchSolution, plan);
    if (!application.accepted) { notify(application.message, true); return; }
    changeDraft({ profile: application.solution.profile });
    setOffsetPreview(null);
    setSketchSelection([]);
    notify(plan.components.length > 1
      ? `${plan.components.length} cadenas equidistantes aplicadas en una operación con separación compartida.`
      : "Equidistancia aplicada. Las copias conservan su relación con las entidades originales.");
  };
  const acceptEdit = () => {
    if (!editing || !canAccept) return;
    if (stagedSketch && (!("sketchId" in editing) || editing.sketchId !== stagedSketch.id)) return;
    if (editing.type === "sketch" && sketchTool === "chamfer") {
      if (chamferPreview) applySketchChamfer(chamferPreview);
      return;
    }
    if (editing.type === "sketch" && sketchTool === "fillet") {
      if (filletPreview) applySketchFillet(filletPreview);
      return;
    }
    if (editing.type === "sketch" && sketchTool === "mirror") {
      if (mirrorPreview) applySketchMirror(mirrorPreview);
      return;
    }
    if (editing.type === "sketch" && sketchTool === "offset") {
      if (offsetPreview) applySketchOffset(offsetPreview);
      return;
    }
    try {
      const bodyApplication = isBodyCommandFeature(editing) && bodyPlan && sourceModel
        ? applyBodyCommand(bodyPlan, { document: operationDocument, feature: editing, selection: bodySelection,
          catalog: { active: sourceModel.bodyCatalogActive === true, bodies: sourceModel.bodies ?? [] } },
          { features: builtFeatures, healthy: !busy && !error && !!model && model.featureErrors.length === 0 }) : null;
      if (isBodyCommandFeature(editing) && !bodyApplication?.accepted) throw new Error(bodyApplication && !bodyApplication.accepted ? bodyApplication.message : "Espera una vista previa válida de los cuerpos.");
      const next = bodyApplication?.accepted ? bodyApplication.document : operationDocument.features.some((f) => f.id === editing.id)
        ? updateFeature(
            operationDocument,
            editing.id,
            editing.type === "sketch"
              ? { ...editing, support: editing.support }
              : editing,
          )
        : addFeature(operationDocument, editing);
      // Acceptance records the sketch before the feature so Undo can remove
      // only the solid operation, just as when exiting the sketch explicitly.
      if (stagedSketch) history.current!.apply(operationDocument);
      apply(next);
      setSelected(editing.id);
      setEditing(null);
      setStagedSketch(null);
      setBodyPicking(false);
      setBodySelection([]);
      setPickingSupport(false);
      setPickingEndFace(false);
      setFaceSelection(null);
      setEdgeSelection([]);
      setSelectionMode("auto");
      setTab("Operaciones");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const cancelEdit = () => {
    setBodyPicking(false);
    setBodySelection([]);
    setPickingEndFace(false);
    setEditing(stagedSketch);
    setStagedSketch(null);
    setPickingSupport(false);
    setFaceSelection(null);
    setEdgeSelection([]);
    setSelectionMode("auto");
    setError("");
    setTab(stagedSketch ? "Croquis" : "Operaciones");
  };
  const changeDraft = (patch: Partial<Feature>) => {
    if (!editing) return;
    const merged = isRevolutionFeature(editing) ? mergeRevolutionDraft(editing, patch as Partial<RevolutionFeature>) : { ...editing, ...patch } as Feature;
    const ownedPattern = isRepetition(merged) && merged.source.mode === 'bodies' ? merged : null;
    const scopedPattern = isRepetition(merged) && merged.featurePattern ? merged : null;
    const selection = ownedPattern?.source.mode === 'bodies' ? ownedPattern.source.bodies
      : scopedPattern && 'featurePattern' in patch ? featureCurrentBodyReferences(scopedPattern)
        : scopedPattern && !featureCurrentBodyReferences(scopedPattern).length ? [] : bodySelection;
    let next = isBodyCommandFeature(merged) ? withBodySelection(merged, selection) : merged;
    let reconciliationError = '';
    if (scopedPattern && 'featurePattern' in patch) {
      setBodySelection(selection.map(ref => ({ ...ref })));
      if (!selection.length) setBodyPicking(false);
    }
    if (isRepetition(next) && next.source.mode === 'bodies') {
      try { next = reconcileBodyPatternDraft(next, undefined, doc.features.find(feature => feature.id === next.id && isRepetition(feature)) as RepetitionFeature | undefined); }
      catch (error) { reconciliationError = error instanceof Error ? error.message : String(error); }
      if ('source' in patch) setBodySelection(selection.map(ref => ({ ...ref })));
    }
    if (JSON.stringify(next) === JSON.stringify(editing)) return;
    if (editing.type === "sketch") {
      setSketchPast((old) => [...old, structuredClone(editing)].slice(-100));
      setSketchFuture([]);
    }
    setError(reconciliationError);
    setEditing(next);
  };
  const chooseBodySelection = (references: BodyReference[]) => {
    invalidateViewportPopup();
    if (editing && isBodyCommandFeature(editing)) {
      let changed = withBodySelection(editing, references);
      if (isRepetition(changed) && changed.source.mode === 'bodies') {
        try { changed = reconcileBodyPatternDraft(changed, undefined, doc.features.find(feature => feature.id === changed.id && isRepetition(feature)) as RepetitionFeature | undefined); }
        catch (error) { setError(error instanceof Error ? error.message : String(error)); return; }
      }
      if (isEdgeFinish(changed) && JSON.stringify(changed.bodyScope) !== JSON.stringify(editing.type === "fillet" || editing.type === "chamfer" ? editing.bodyScope : undefined)) {
        changed.selection = { mode: "selected", edges: [] };
        setFinishPreview(false);
      }
      if (isFaceOperation(changed) && JSON.stringify(changed.bodyScope) !== JSON.stringify(isFaceOperation(editing) ? editing.bodyScope : undefined)) {
        if (changed.type === "shell") changed.removedFaces = []; else changed.faces = [];
        setFacePreview(false);
      }
      setEditing(changed); setBodyPicking(true); setError("");
    }
    if (!editing) { setFaceSelection(null); setEdgeSelection([]); setSelected(null); }
    setBodySelection(references.map(ref => ({ ...ref })));
  };
  const toggleBody = (reference: BodyReference) => {
    if (editing && !bodyPicking) return;
    const catalog = editing ? sourceModel : model;
    if (!catalog?.bodyCatalogActive || catalog.bodies?.filter(body => sameBodyReference(body.ref, reference)).length !== 1) return;
    const single = !!editing && (editing.type === "extrude" || editing.type === "revolve" || editing.type === "sweep" || editing.type === "loft" || isEdgeFinish(editing) || isFaceOperation(editing));
    chooseBodySelection(bodySelection.some(ref => sameBodyReference(ref, reference))
      ? bodySelection.filter(ref => !sameBodyReference(ref, reference))
      : single ? [{ ...reference }] : [...bodySelection, { ...reference }]);
  };
  const clearBrowsingSelection = () => {
    invalidateViewportPopup();
    if (editing || busy || !previewCurrent) return;
    setNormalSelection(null);
    setFaceSelection(null);
    setEdgeSelection([]);
    setBodySelection([]);
    setSelected(null);
  };
  const changeSelectionMode = (mode: PartSelectionMode) => {
    if (editing || busy || !previewCurrent) return;
    clearBrowsingSelection();
    setSelectionMode(mode);
  };
  const cancelActiveEdit = () => {
    if (editing?.type === "sketch" && (sketchTool === "chamfer" || sketchTool === "fillet" || sketchTool === "mirror" || sketchTool === "offset")) {
      setSketchTool("select");
      setSketchSelection([]);
      setChamferPreview(null);
      setFilletPreview(null);
      setMirrorPreview(null);
      setOffsetPreview(null);
      setMirrorPickingAxis(false);
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
    if ((candidate.constraints.some(constraint => constraint.type === "offset") ||
      entityProfile?.constraints.some(constraint => constraint.type === "offset")) &&
      !["underdefined", "fullyDefined"].includes(result.status)) {
      notify(`No se puede modificar la equidistancia: ${result.message}`, true);
      return;
    }
    changeDraft({
      profile: ["underdefined", "fullyDefined"].includes(result.status)
        ? result.profile
        : candidate,
    });
  };
  const repositionEntityPoints = (command: PointRepositionCommand) => {
    if (editing?.type !== "sketch") return;
    const result = repositionDisplayedSketch(sketchSolution, command);
    if (!result.accepted) { notify(result.message, true); return; }
    if (result.changed) changeDraft({ profile: result.solution.profile });
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
    if (tool === "mirror") {
      setMirrorPreview(null);
      setMirrorAxisId("");
      setMirrorPickingAxis(false);
      setSketchSelection(old => old.filter(item => item.kind === "entity"));
    }
    if (tool === "offset") {
      setOffsetPreview(null);
      setSketchSelection(old => old.filter(item => item.kind === "entity"));
    }
    if (tool !== "chamfer" && tool !== "fillet" && tool !== "mirror" && tool !== "offset") setSketchSelection([]);
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
      if (e.defaultPrevented || newDocumentDialog.pending()) return;
      const input =
        e.target instanceof HTMLElement &&
        !!e.target.closest("input,textarea,select,[contenteditable='true']");
      if (namedViews.isOpen) return;
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
        (sketchTool === "chamfer" || sketchTool === "fillet" || sketchTool === "mirror" || sketchTool === "offset")
      ) {
        e.preventDefault();
        cancelActiveEdit();
        return;
      }
      const requestedView = viewShortcutCommand(e, input);
      if (requestedView) {
        if (document.querySelector('[role="menu"]')) return;
        e.preventDefault();
        if (!e.repeat) changeView(requestedView);
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
          if (key === "z" && !e.shiftKey) undo();
          if (key === "y") redo();
        }
      } else if (!input) {
        if (e.key === "Escape") {
          if (entityProfile) {
            setSketchTool("select");
            setSketchSelection([]);
          } else cancelEdit();
        }

        if (e.key === "Delete") deleteSelected();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });
  const profile: Profile =
    editing?.type === "sketch"
      ? (toolConvertedProfile ?? editing.profile)
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
  const availableFeatures = operationDocument.features.slice(
    0,
    editingIndex < 0 ? operationDocument.features.length : editingIndex,
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
    const currentFace = sourceFaceSelection.find(support.face);
    if (currentFace?.frame) return currentFace.frame;
    const builtHole = builtFeatures?.find((item) => item.id === holeEditing.id);
    if (
      builtHole?.type === "hole" &&
      JSON.stringify(builtHole.support) === JSON.stringify(support)
    )
      return model?.holes?.find((item) => item.id === holeEditing.id)?.frame;
    return undefined;
  }, [holeEditing, sourceModel, sourceFaceSelection, model, builtFeatures]);
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
  const availableSketches = operationDocument.features
    .slice(0, editingIndex < 0 ? operationDocument.features.length : editingIndex)
    .filter((feature): feature is SketchFeature => feature.type === "sketch");
  const consumedSketches = new Set(
    effectiveFeatures
      .filter((feature) => !feature.suppressed)
      .flatMap(featureSketchIds),
  );
  const selectedSketchId =
    selectedFeature?.type === "sketch" ? selectedFeature.id : undefined;
  // Presentation only: operationDocument includes the staged sketch. Use its solved source input.
  const activeInputSketchKey = JSON.stringify(editing && !editing.suppressed
    ? [...new Set(featureSketchIds(editing))] : []);
  // Keep display inputs stable when only an operation parameter or its name changes.
  const activeInputSketchIds = useMemo(() => JSON.parse(activeInputSketchKey) as string[], [activeInputSketchKey]);
  const activeInputSketches = useMemo(() => {
    if (!activeInputSketchIds.length || !sourceFeatures || sourceLoading
      || sourceBuiltFeatures !== sourceFeatures || !sourceModel || sourceModel.featureErrors.length) return [];
    const eligible = new Set(sourceFeatures.filter(feature => feature.type === "sketch" && !feature.suppressed)
      .map(feature => feature.id));
    return (sourceModel.sketches ?? []).filter(sketch => eligible.has(sketch.id) && activeInputSketchIds.includes(sketch.id));
  }, [activeInputSketchIds, sourceFeatures, sourceLoading, sourceBuiltFeatures, sourceModel]);
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
  const featureTree = buildPartFeatureTree(doc.features, expandedFeatureIds, query);
  const viewportContextBlocked = !!editing || !!stagedSketch || busy || !ready || !previewCurrent || !visibleModel
    || sourceLoading || importing || exporting || discardOpen || rename || showHelp || newDocumentDialog.pending()
    || namedViews.isOpen || viewHistory.navigating;
  const browsingSelectionKey = JSON.stringify([selected, faceSelection?.ref ?? null, edgeSelection, bodySelection, normalReferences]);
  const viewportContextFrame = useMemo(() => ({ document: doc, model: visibleModel, selection: browsingSelectionKey,
    mode: selectionMode, showPlanes, view, blocked: viewportContextBlocked }),
    [doc, visibleModel, browsingSelectionKey, selectionMode, showPlanes, view, viewportContextBlocked]);
  const viewportContextCurrent = useRef({ frame: viewportContextFrame, popup: viewportPopup });
  viewportContextCurrent.current = { frame: viewportContextFrame, popup: viewportPopup };
  const viewportContextIsCurrent = (popup: ViewportPopup) => {
    const live = viewportContextCurrent.current;
    return viewportPopupAuthority.current === popup && live.popup === popup && !live.frame.blocked
      && mounted.current && !fileOperation.current && !discardDecision.current && !newDocumentRequest.current
      && !editingRef.current && popup.epoch === documentEpoch.current && popup.document === docRef.current
      && popup.document === live.frame.document && popup.model === live.frame.model && popup.selection === live.frame.selection
      && !!resolvePartContextTarget(popup.target, docRef.current, live.frame.model, live.frame.showPlanes);
  };
  const activeViewportPopup = viewportPopup && viewportContextIsCurrent(viewportPopup) ? viewportPopup : null;
  useLayoutEffect(() => { if (viewportPopup && !activeViewportPopup) invalidateViewportPopup(); }, [viewportPopup, activeViewportPopup]);
  const openViewportContext = (request: PartViewportContextRequest) => {
    if (viewportContextCurrent.current.frame !== viewportContextFrame || viewportContextBlocked || docRef.current !== doc
      || !mounted.current || editingRef.current || fileOperation.current || discardDecision.current
      || newDocumentRequest.current || request.model !== visibleModel) return;
    let target = request.target;
    if (target.kind === 'keyboard') {
      if (faceSelection && !edgeSelection.length && !bodySelection.length && normalReferences?.length === 1)
        target = { kind: 'face', reference: faceSelection.ref };
      else if (edgeSelection.length === 1 && !faceSelection && !bodySelection.length)
        target = { kind: 'edge', reference: edgeSelection[0] };
      else if (bodySelection.length === 1 && !faceSelection && !edgeSelection.length)
        target = { kind: 'body', reference: bodySelection[0] };
      else if (normalReferences?.length === 1 && normalReferences[0].kind !== 'face') {
        const reference = normalReferences[0];
        target = reference.kind === 'feature' ? { kind: 'feature', id: reference.id } : { kind: 'principal', plane: reference.plane };
      } else target = { kind: 'background' };
    }
    const resolved = resolvePartContextTarget(target, doc, visibleModel, showPlanes);
    if (!resolved) return;
    target = resolved.target;
    let selection = browsingSelectionKey;
    if (target.kind === 'face') {
      selectViewReference({ kind: 'face', face: target.reference });
      selection = JSON.stringify([null, target.reference, [], [], [{ kind: 'face', face: target.reference }]]);
    } else if (target.kind === 'principal' || target.kind === 'plane' || target.kind === 'feature') {
      const reference: PartViewReference = target.kind === 'principal'
        ? { kind: 'principal', plane: target.plane } : { kind: 'feature', id: target.id };
      selectViewReference(reference);
      selection = JSON.stringify([target.kind === 'principal' ? target.plane : target.id, null, [], [], [reference]]);
    } else if (target.kind === 'edge') {
      invalidateViewportPopup(); setNormalSelection(null); setSelected(null); setFaceSelection(null); setBodySelection([]);
      const references = [{ ...target.reference }]; setEdgeSelection(references);
      selection = JSON.stringify([null, null, references, [], null]);
    } else if (target.kind === 'body' && target.reference) {
      chooseBodySelection([target.reference]); setNormalSelection(null);
      selection = JSON.stringify([null, null, [], [target.reference], null]);
    } else if (target.kind === 'body' && resolved.feature) {
      selectViewReference({ kind: 'feature', id: resolved.feature.id });
      selection = JSON.stringify([resolved.feature.id, null, [], [], [{ kind: 'feature', id: resolved.feature.id }]]);
    }
    setFeatureMenu(null);
    const popup: ViewportPopup = { requestId: crypto.randomUUID(), target, document: doc, model: visibleModel,
      selection, epoch: documentEpoch.current, point: request.point, origin: request.origin };
    viewportPopupAuthority.current = popup; setViewportPopup(popup);
  };
  const viewportContext = activeViewportPopup
    ? resolvePartContextTarget(activeViewportPopup.target, doc, visibleModel, showPlanes) : null;
  const viewportContextAction = (action: () => void) => {
    if (!activeViewportPopup || !viewportContextIsCurrent(activeViewportPopup)) return;
    invalidateViewportPopup(); action();
  };
  const menuFeature = featureMenu ? doc.features.find(feature => feature.id === featureMenu.featureId) : undefined;
  const inputSketches = (feature: Feature) => [...new Set(featureSketchIds(feature))]
    .map(id => doc.features.find(candidate => candidate.id === id))
    .filter((candidate): candidate is SketchFeature => candidate?.type === "sketch");
  const selectedInputSketches = selectedFeature ? inputSketches(selectedFeature) : [];
  const viewportContextActions: CadContextAction[] = viewportContext ? [
    ...(viewportContext.feature ? [{ id: 'edit-feature', label: viewportContext.feature.type === 'sketch' ? 'Editar croquis' : 'Editar operación', icon: Pencil,
      onSelect: () => viewportContextAction(() => editFeature(viewportContext.feature!)) },
      ...inputSketches(viewportContext.feature).map(sketch => ({ id: `edit-sketch-${sketch.id}`, label: `Editar croquis: ${sketch.name}`, icon: Square,
        onSelect: () => viewportContextAction(() => editFeature(sketch, viewportContext.feature!.id)) }))] : []),
    ...(viewportContext.canSketch ? [{ id: 'new-sketch', label: 'Crear croquis', icon: Pencil,
      onSelect: () => viewportContextAction(() => startSketch()) }] : []),
    { id: 'normal-to', label: 'Normal a', icon: PanelTop, disabled: !canNormal,
      onSelect: () => viewportContextAction(() => changeView('normal')) },
    ...[...standardViews, { name: 'fit' as const, label: 'Ajustar a pantalla' }, { name: 'previous' as const, label: 'Vista anterior' }]
      .map(({ name, label }) => ({ id: `view-${name}`, label, disabled: name === 'previous' && !viewHistory.canPrevious,
        onSelect: () => viewportContextAction(() => changeView(name)) })),
    { id: 'named-views', label: 'Vistas guardadas…', disabled: !namedViews.canOpen,
      onSelect: () => viewportContextAction(namedViews.open) },
    { id: 'clear-selection', label: 'Deseleccionar', disabled: !faceSelection && !edgeSelection.length && !bodySelection.length && !selected,
      onSelect: () => viewportContextAction(clearBrowsingSelection) },
  ] : [];
  const openFeatureMenu = (feature: Feature, origin: HTMLElement, point?: { x: number; y: number }, parentId?: string) => {
    invalidateViewportPopup();
    selectedTreeOccurrence.current = { featureId: feature.id, parentId };
    if (!editing) selectViewReference({ kind: 'feature', id: feature.id });
    else { setSelected(feature.id); setFaceSelection(null); }
    const bounds = origin.getBoundingClientRect();
    setFeatureMenu({ requestId: crypto.randomUUID(), featureId: feature.id, parentId, origin, point: point ?? { x: bounds.left + 20, y: bounds.bottom } });
  };
  const setFeatureExpanded = (featureId: string, expanded: boolean) => {
    const group = featureTree.find(candidate => candidate.feature.id === featureId);
    if (!group?.children.length || group.forcedOpen) return;
    if (!expanded && document.activeElement instanceof HTMLElement
      && document.activeElement.dataset.parentFeatureId === featureId) focusTreeOccurrence(featureId);
    setExpandedFeatureIds(previous => {
      const next = new Set(previous);
      if (expanded) next.add(featureId); else next.delete(featureId);
      return next;
    });
  };
  const row = (feature: Feature, parentId?: string) => {
    const Icon = featureIcons[feature.type];
    const failed = model?.featureErrors.some((e) => e.id === feature.id);
    const group = parentId === undefined ? featureTree.find(candidate => candidate.feature.id === feature.id) : undefined;
    return (
      <div className="part-tree-entry" key={treeOccurrenceKey(feature.id, parentId)}>
      {group && group.children.length > 0 && <button type="button" className="part-tree-toggle"
        data-part-tree-toggle={feature.id} aria-expanded={group.expanded}
        aria-label={`${group.expanded ? "Plegar" : "Desplegar"} ${feature.name}`}
        aria-controls={partTreeChildrenId(feature.id)}
        disabled={group.forcedOpen} title={group.forcedOpen ? "Los resultados del filtro permanecen desplegados" : undefined}
        onClick={() => setFeatureExpanded(feature.id, !group.expanded)}>
        {group.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      </button>}
      <div
        className={`tree-row ${parentId !== undefined ? "nested" : ""} ${selected === feature.id || !editing && normalReferences?.some(reference => reference.kind === 'feature' && reference.id === feature.id) ? "selected" : ""} ${feature.suppressed ? "suppressed" : ""}`}
        data-feature-id={feature.id}
        data-parent-feature-id={parentId}
        data-tree-occurrence={treeOccurrenceKey(feature.id, parentId)}
        tabIndex={0}
        role="button"
        aria-label={feature.name}
        aria-haspopup="menu"
        aria-expanded={featureMenu?.featureId === feature.id && featureMenu.parentId === parentId}
        onClick={event => {
          selectedTreeOccurrence.current = { featureId: feature.id, parentId };
          if (!editing) selectViewReference({ kind: 'feature', id: feature.id }, event.ctrlKey || event.metaKey);
          else { setSelected(feature.id); setFaceSelection(null); }
        }}
        onDoubleClick={() => editFeature(feature, parentId)}
        onContextMenu={event => {
          event.preventDefault();
          openFeatureMenu(feature, event.currentTarget, { x: event.clientX, y: event.clientY }, parentId);
        }}
        onKeyDown={event => {
          if (event.key === "ContextMenu" || event.shiftKey && event.key === "F10") {
            event.preventDefault(); event.stopPropagation(); openFeatureMenu(feature, event.currentTarget, undefined, parentId);
          } else if (event.key === "ArrowRight") {
            event.preventDefault(); event.stopPropagation();
            if (group?.children.length) {
              if (!group.expanded) setFeatureExpanded(feature.id, true);
              else focusTreeOccurrence(group.children[0].id, feature.id);
            }
          } else if (event.key === "ArrowLeft") {
            event.preventDefault(); event.stopPropagation();
            if (parentId !== undefined) focusTreeOccurrence(parentId);
            else if (group?.expanded) setFeatureExpanded(feature.id, false);
          } else if (event.key === "Enter") {
            event.preventDefault(); editFeature(feature, parentId);
          } else if (event.key === " ") {
            selectedTreeOccurrence.current = { featureId: feature.id, parentId };
            event.preventDefault();
            if (!editing) selectViewReference({ kind: 'feature', id: feature.id }, event.ctrlKey || event.metaKey);
            else { setSelected(feature.id); setFaceSelection(null); }
          }
        }}
        title="Doble clic para editar · Botón derecho para opciones"
      >
        <Icon size={16} />
        <span>{feature.name}</span>
        {failed && <AlertTriangle size={13} className="error-icon" />}
        {feature.suppressed && <Eye size={12} />}
      </div>
      </div>
    );
  };
  const disabledMenuCommands: Record<string, boolean> = {
    "Nuevo…": newDocumentBlocked,
    "Vista anterior": !viewHistory.canPrevious || viewIs2D,
    "Ajustar a pantalla": viewHistory.navigating,
    ...Object.fromEntries(standardViews.map(view => [view.label, !!viewIs2D || viewHistory.navigating])),
    'Normal a': !canNormal,
    'Vistas guardadas…': !namedViews.canOpen,
    "Nuevo ensamblaje vacío": newDocumentBlocked,
    "Crear ensamblaje con esta pieza": !canCreateAssemblyFromPart,
    "Importar STEP…": !!editing || importing || exporting,
    "Importar STEP estructurado…": !!editing || importing || exporting,
    "Guardar": !!editing || importing || exporting, "Guardar como…": !!editing || importing || exporting,
    "Exportar STEP": !canExport, "Exportar STL": !canExport,
    "Deshacer": editing?.type === "sketch" ? !sketchPast.length : !!editing || !history.current.canUndo,
    "Rehacer": editing?.type === "sketch" ? !sketchFuture.length : !!editing || !history.current.canRedo,
    "Editar operación": !!editing || !selectedFeature, "Eliminar operación": !!editing || !selectedFeature,
    "Cambiar nombre de pieza": !!editing,
    "Croquis rectangular": !!editing, "Croquis circular": !!editing,
    "Saliente extruido": !canStartProfileFeature, "Corte extruido": !canStartProfileFeature || !model?.vertices.length,
    "Revolución": !canStartProfileFeature, "Corte por revolución": !canStartProfileFeature || !model?.vertices.length,
    "Asistente para taladro": !canExport,
    "Barrido": !!editing, "Recubrir": !!editing, "Redondeo": !canExport, "Chaflán": !canExport,
    "Vaciado": !canExport, "Desmoldeo": !canExport, "Plano de referencia": !!editing,
    "Matriz lineal": !canExport, "Matriz circular": !canExport, "Simetría": !canExport,
    "Reconstruir": !!editing || importing || exporting,
  };
  const partMenus: AssemblyMenuDefinition[] = ([
    {
      id: "file", label: "Archivo", items: [
        ["Nuevo…", "Ctrl+N", newDoc],
        ["Nuevo ensamblaje vacío", "", newAssembly],
        ["Crear ensamblaje con esta pieza", "", newAssemblyFromPart],
        ["Abrir…", "Ctrl+O", openDoc],
        ["Importar STEP…", "", selectStep],
        ["Importar STEP estructurado…", "", () => void selectStructuralStep()],
        ["Guardar", "Ctrl+S", () => saveDoc()],
        ["Guardar como…", "Ctrl+Mayús+S", () => saveDoc(true)],
        ["Exportar STEP", "", () => exportFile("step")],
        ["Exportar STL", "", () => exportFile("stl")],
        ["Abrir pieza de ejemplo", "", loadDemo],
        ["Ejemplo: cortes y salientes sucesivos", "", loadPartSequenceDemo],
      ],
    },
    {
      id: "edit", label: "Editar", items: [
        ["Deshacer", "Ctrl+Z", undo],
        ["Rehacer", "Ctrl+Y", redo],
        ["Editar operación", "", () => selectedFeature && editFeature(selectedFeature)],
        ...selectedInputSketches.map((sketch): [string, string, () => void] => [selectedInputSketches.length === 1 ? "Editar croquis" : `Editar croquis: ${sketch.name}`, "", () => editFeature(sketch, selectedFeature?.id)]),
        ["Eliminar operación", "Supr", deleteSelected],
        ["Cambiar nombre de pieza", "", () => {
          if (requireFinishedEdit()) setRename(true);
        }],
      ],
    },
    {
      id: "view", label: "Ver", items: [
        ...standardViews.map(({ name, label, shortcut }): [string, string, () => void] => [label, shortcut, () => changeView(name)]),
        ["Normal a", "Ctrl+8", () => changeView("normal")],
        ["Vistas guardadas…", "", namedViews.open],
        ["Vista anterior", "Ctrl+Shift+Z", () => changeView("previous")],
        ["Ajustar a pantalla", "F", () => changeView("fit")],
        ["Cuadrícula", "", () => setGrid(!grid)],
        ["Planos de referencia", "", () => setShowPlanes(!showPlanes)],
      ],
    },
    {
      id: "insert", label: "Insertar", items: [
        ["Croquis rectangular", "", () => startSketch()],
        ["Croquis circular", "", () => startSketch("circle")],
        ["Saliente extruido", "", () => startFeature("extrude")],
        ["Corte extruido", "", () => startFeature("cut")],
        ["Asistente para taladro", "", startHole],
        ["Revolución", "", () => startFeature("revolve")],
        ["Corte por revolución", "", () => startFeature("revolvedCut")],
        ["Barrido", "", () => startAdvancedFeature("sweep")],
        ["Recubrir", "", () => startAdvancedFeature("loft")],
        ["Redondeo", "", () => startFinish("fillet")],
        ["Chaflán", "", () => startFinish("chamfer")],
        ["Vaciado", "", () => startFaceOperation("shell")],
        ["Desmoldeo", "", () => startFaceOperation("draft")],
        ["Plano de referencia", "", startPlane],
        ["Matriz lineal", "", () => startRepetition("linearPattern")],
        ["Matriz circular", "", () => startRepetition("circularPattern")],
        ["Simetría", "", () => startRepetition("mirror")],
      ],
    },
    {
      id: "tools", label: "Herramientas", items: [
        ["Propiedades físicas", "", () => setPanel("properties")],
        ["Reconstruir", "", () => setDoc({ ...doc, features: [...doc.features] })],
      ],
    },
    {
      id: "help", label: "Ayuda", items: [
        ["Ayuda y atajos", "", () => setShowHelp(true)],
        ["Pieza de ejemplo", "", loadDemo],
      ],
    },
  ] satisfies { id: string; label: string; items: [string, string, () => void][] }[])
    .map(({ id, label, items }) => ({
      id, label, items: items.map(([label, shortcut, onSelect], index) => ({
        id: String(index), label, shortcut, onSelect, disabled: label.startsWith("Editar croquis") ? !!editing || importing || exporting : disabledMenuCommands[label],
        ...(label === "Cuadrícula" ? { checked: grid } : label === "Planos de referencia" ? { checked: showPlanes } : {}),
      })),
    }));
  const operationNameEditor = editing && (
    <div className="property-section operation-name-section">
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
  );
  const operationBodyEditor = editing && isBodyCommandFeature(editing) && editing.type !== "sweep" && editing.type !== "loft" && !isRepetition(editing) && <BodyFeaturePanel
    feature={editing} outputBodyId={bodyOutputId.current}
    existing={doc.features.some(feature => feature.id === editing.id)}
    bodies={sourceModel?.bodies ?? []} selection={bodySelection}
    onSelection={chooseBodySelection}
    disabled={sourceLoading || sourceBuiltFeatures !== sourceFeatures}
    picking={bodyPicking} onPicking={setBodyPicking}
    onFeature={feature => {
      const separate = (feature.type === "extrude" || feature.type === "revolve") && feature.bodyOperation?.mode === "new";
      const selection = separate ? [] : bodySelection;
      if (separate) setBodySelection([]);
      setEditing(withBodySelection(feature, selection));
      setBodyPicking(feature.type === "combine" || (feature.type === "extrude" || feature.type === "revolve") && feature.bodyOperation?.mode === "merge");
      setError("");
    }}
    message={bodyCommand && !bodyCommand.accepted ? bodyCommand.message : undefined}
  />;

  return (
    <div className="app-shell">
      {newDocumentDialog.dialog}
      {activeViewportPopup && viewportContext && <CadContextMenu key={activeViewportPopup.requestId} namespace="part"
        targetName={viewportContext.name} point={activeViewportPopup.point} restoreFocusElement={activeViewportPopup.origin}
        actions={viewportContextActions} onClose={() => setViewportPopup(null)} />}
      {featureMenu && menuFeature && <PartFeatureContextMenu key={featureMenu.requestId}
        featureName={menuFeature.name} point={featureMenu.point} restoreFocusElement={featureMenu.origin}
        onClose={() => setFeatureMenu(null)}
        actions={[
          { id: "edit-feature", label: menuFeature.type === "sketch" ? "Editar croquis" : "Editar operación", icon: Pencil,
            disabled: !!editing || importing || exporting, onSelect: () => editFeature(menuFeature, featureMenu.parentId) },
          ...inputSketches(menuFeature).map(sketch => ({ id: `edit-sketch-${sketch.id}`, label: `Editar croquis: ${sketch.name}`, icon: Square,
            disabled: !!editing || importing || exporting, onSelect: () => editFeature(sketch, menuFeature.id) })),
          { id: 'normal-to', label: 'Normal a', icon: PanelTop,
            disabled: !!editing || !canNormal, onSelect: () => changeView('normal') },
        ]} />}
      <input
        ref={fileInput}
        type="file"
        accept=".solidflow"
        hidden
        onChange={async (e) => {
          const input = e.currentTarget;
          const f = input.files?.[0], source = browserOpenSource.current;
          browserOpenSource.current = null;
          input.value = "";
          if (!f || !source || !isReplacementCurrent(source)) return;
          if (fileOperation.current) { notify("Espera a que termine la operación de archivo actual."); return; }
          fileOperation.current = true;
          try {
            if (f.size > MAX_ASSEMBLY_BYTES) throw new Error("El documento supera los 20 MB admitidos.");
            openReplacement(await f.text(), undefined, source);
          } catch (err) {
            if (mounted.current) notify((err as Error).message, true);
          } finally { fileOperation.current = false; }
        }}
      />
      <input
        ref={stepInput}
        type="file"
        accept=".step,.stp"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void performStepImport(async () => {
            if (file.size > MAX_STEP_BYTES) throw new Error("El STEP supera los 8 MB admitidos.");
            return { name: file.name, data: new Uint8Array(await file.arrayBuffer()) };
          });
        }}
      />
      <input ref={structuralInput} type="file" accept=".step,.stp" hidden onChange={e=>{
        const file=e.target.files?.[0], pending=structuralRead.current; e.target.value='';structuralRead.current=null;if(!pending)return;
        if(!file){pending.resolve(null);return;} if(file.size>MAX_STEP_BYTES){pending.reject(Error('El STEP supera los 8 MB admitidos.'));return;}
        void file.arrayBuffer().then(data=>pending.resolve({name:file.name,data:new Uint8Array(data)}),pending.reject);
      }} />
      <CommandHeader className="menubar"
        brand={<div className="brand" aria-label="SolidFlow">
          <div className="brand-mark" aria-hidden="true">
            S<span>F</span>
          </div>
          <strong aria-hidden="true">
            Solid<span>Flow</span>
          </strong>
        </div>}
        menus={<AssemblyMenuBar variant="part" menus={partMenus} />}
        document={<div className="document-title" title={`${doc.name}${dirty ? " · Cambios sin guardar" : ""} — SolidFlow`}>
          {doc.name}
          {dirty ? " *" : ""} — SolidFlow
        </div>}
        quickActions={<div className="quick-actions">
          <IconButton
            icon={FilePlus2}
            title="Nuevo… (Ctrl+N)"
            onClick={newDoc}
            disabled={newDocumentBlocked}
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
        </div>}
        utilities={<><div className="command-search">
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
          <Box size={13} aria-hidden="true" /> Pieza
        </div>
        <button className="help-top" onClick={() => setShowHelp(true)} title="Ayuda">
          <HelpCircle size={17} />
        </button></>}
      />
      <section className="command-manager">
        <div className="commands">
          {tab === "Operaciones" ? (
            <>
              <CommandGroup label="Crear">
                <Command
                  icon={Box}
                  label="Saliente/Base extruido"
                  large
                  onClick={() => startFeature("extrude")}
                  disabled={!canStartProfileFeature}
                />
                <Command
                  icon={RotateCw}
                  label="Revolución"
                  large
                  onClick={() => startFeature("revolve")}
                  disabled={!canStartProfileFeature}
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
              </CommandGroup>
              <CommandGroup label="Quitar material">
                <Command
                  icon={Scissors}
                  label="Corte extruido"
                  large
                  onClick={() => startFeature("cut")}
                  disabled={!canStartProfileFeature || !model?.vertices.length}
                />
                <Command
                  icon={RotateCw}
                  label="Corte por revolución"
                  large
                  onClick={() => startFeature("revolvedCut")}
                  disabled={!canStartProfileFeature || !model?.vertices.length}
                />
                <Command
                  icon={Crosshair}
                  label="Asistente para taladro"
                  large
                  disabled={!canExport}
                  onClick={startHole}
                />
              </CommandGroup>
              <CommandGroup label="Modificar">
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
              </CommandGroup>
              <CommandGroup label="Patrones">
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
              </CommandGroup>
              <CommandGroup label="Cuerpos">
                <div className="command-stack">
                  <Command icon={Component} label="Combinar cuerpos" onClick={startCombine}
                    disabled={!canExport || !model?.bodyCatalogActive || bodySelection.length < 2} />
                </div>
              </CommandGroup>
              <CommandGroup label="Referencias">
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
              </CommandGroup>
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
                        : sketchTool === "mirror"
                        ? "Aplicar simetría"
                        : sketchTool === "offset"
                        ? "Aplicar equidistancia"
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
                  active={editing?.type === "sketch" && sketchTool === "select"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={Minus}
                  label="Línea"
                  large
                  onClick={() => selectSketchTool("line")}
                  active={editing?.type === "sketch" && sketchTool === "line"}
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
                  active={editing?.type === "sketch" && sketchTool === "rectangle"}
                  disabled={!!editing && editing.type !== "sketch"}
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
                  active={editing?.type === "sketch" && sketchTool === "circle"}
                  disabled={!!editing && editing.type !== "sketch"}
                />
                <Command
                  icon={Spline}
                  label="Arco de centro"
                  large
                  onClick={() => selectSketchTool("arc")}
                  active={editing?.type === "sketch" && sketchTool === "arc"}
                  disabled={!!editing && editing.type !== "sketch"}
                />
              </div>
              <div className="command-group">
                <Command
                  icon={Scissors}
                  label="Recortar entidades"
                  large
                  onClick={() => selectSketchTool("trim")}
                  active={editing?.type === "sketch" && sketchTool === "trim"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={ArrowRightToLine}
                  label="Extender entidades"
                  large
                  onClick={() => selectSketchTool("extend")}
                  active={editing?.type === "sketch" && sketchTool === "extend"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={Triangle}
                  label="Chaflán de croquis"
                  large
                  onClick={() => selectSketchTool("chamfer")}
                  active={editing?.type === "sketch" && sketchTool === "chamfer"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command
                  icon={CornerDownRight}
                  label="Redondeo de croquis"
                  large
                  onClick={() => selectSketchTool("fillet")}
                  active={editing?.type === "sketch" && sketchTool === "fillet"}
                  disabled={editing?.type !== "sketch"}
                />
                <Command icon={FlipHorizontal2} label="Simetría de croquis" large
                  onClick={() => selectSketchTool("mirror")} active={editing?.type === "sketch" && sketchTool === "mirror"}
                  disabled={editing?.type !== "sketch"} />
                <Command icon={CopyPlus} label="Equidistancia de entidades" large
                  onClick={() => selectSketchTool("offset")} active={editing?.type === "sketch" && sketchTool === "offset"}
                  disabled={editing?.type !== "sketch"} />
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
          <button onClick={() => void newAssembly()} title="Crear un ensamblaje" disabled={newDocumentBlocked}>
            Ensamblaje
          </button>
          <button onClick={newAssemblyFromPart} disabled={!canCreateAssemblyFromPart}
            aria-label="Crear ensamblaje con esta pieza"
            title="Crear ensamblaje con esta pieza: copia independiente, fija en el origen. Incluye los cambios aceptados sin guardar.">
            Con esta pieza
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
            <div className={`property-manager${isRevolutionFeature(editing) ? " property-manager-revolve" : editing.type === "extrude" || editing.type === "cut" ? " property-manager-extrude" : isEdgeFinish(editing) ? " property-manager-finish" : ""}`}>
              <div className="property-manager-header">
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
              </div>
              {!isRevolutionFeature(editing) && editing.type !== "extrude" && editing.type !== "cut" && !isEdgeFinish(editing) && <>{operationNameEditor}{operationBodyEditor}</>}
              {editing.type === "sketch" ? (
                <>
                  {sketchTool === "offset" && entityProfile && <SketchOffsetPanel
                    profile={entityProfile} solution={sketchSolution} selection={sketchSelection}
                    onSelection={next => { setOffsetPreview(null); setSketchSelection(next); }} onPreview={setOffsetPreview}
                    onApply={applySketchOffset} onCancel={cancelActiveEdit} />}
                  {sketchTool === "mirror" && entityProfile && <SketchMirrorPanel
                    profile={entityProfile} solution={sketchSolution} selection={sketchSelection}
                    axisEntityId={mirrorAxisId} pickingAxis={mirrorPickingAxis}
                    onAxisChange={chooseMirrorAxis} onPickAxis={() => setMirrorPickingAxis(old => !old)}
                    onSelection={next => { setMirrorPreview(null); setSketchSelection(next); }} onPreview={setMirrorPreview}
                    onApply={applySketchMirror} onCancel={cancelActiveEdit} />}
                  {sketchTool === "fillet" && entityProfile && (
                    <SketchFilletPanel
                      profile={entityProfile}
                      solution={sketchSolution}
                      selection={sketchSelection}
                      previousFilletId={previousFilletId}
                      onSelection={setSketchSelection}
                      onSelectionCheck={check => { filletSelectionCheck.current = check; }}
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
                      onReposition={repositionEntityPoints}
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
                    sourceSelectionDtos.faces.some((face) => face.frame)
                  }
                  onPickFace={() => setPickingSupport(!pickingSupport)}
                  selectedPosition={selectedHolePosition}
                  onSelectPosition={setSelectedHolePosition}
                  baseFeatureId={
                    editing.bodyScope ? editing.bodyScope[0]?.sourceFeatureId ?? null : sourceModel?.faces?.[0]?.ref.sourceFeatureId ?? null
                  }
                  loading={sourceLoading}
                />
              ) : editing.type === "combine" ? (
                <p className="muted-small">Revisa la selección y el resultado antes de aceptar. Cancelar conserva todos los cuerpos de origen.</p>
              ) : editing.type === "importedSolid" || editing.type === "importedBodies" ? (
                <div className="property-section">
                  <h3><ChevronDown size={12} /> Geometría base</h3>
                  <p className="muted-small">{editing.type === "importedBodies" ? `${editing.bodies.length} cuerpos STEP están guardados dentro de esta pieza con identidades separadas. Selecciona un cuerpo exacto para las operaciones posteriores.` : 'El sólido STEP está guardado dentro de esta pieza. Selecciona sus caras o aristas para añadir croquis, taladros y operaciones.'}</p>
                  <p className="muted-small">La importación conserva la geometría; no reconstruye el historial de diseño original. Las nuevas operaciones aparecen en el árbol y siguen siendo editables.</p>
                </div>
              ) : editing.type === "sweep" || editing.type === "loft" ? (
                <SweepLoftPanel
                  feature={editing}
                  sketches={availableSketches}
                  bodyEditor={editing.bodyOperation ? {
                    bodies: sourceModel?.bodies ?? [], selection: bodySelection,
                    outputBodyId: bodyOutputId.current, existing: doc.features.some(feature => feature.id === editing.id),
                    picking: bodyPicking, loading: sourceLoading || sourceBuiltFeatures !== sourceFeatures,
                    onSelection: chooseBodySelection, onPicking: setBodyPicking,
                    message: bodyCommand && !bodyCommand.accepted ? bodyCommand.message : undefined,
                  } : undefined}
                  onChange={patch => {
                    if ('bodyOperation' in patch && patch.bodyOperation) {
                      setBodyPicking(patch.bodyOperation.mode === 'merge');
                      if (patch.bodyOperation.mode === 'new') setBodySelection([]);
                    }
                    changeDraft(patch);
                  }}
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
                    sourceSelectionDtos.faces.some((face) => face.frame)
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
                  bodyEditor={sourceModel?.bodyCatalogActive ? {
                    bodies: sourceModel?.bodies ?? [], existing: doc.features.some(feature => feature.id === editing.id),
                    picking: bodyPicking, loading: sourceLoading || sourceBuiltFeatures !== sourceFeatures,
                    onSelection: chooseBodySelection, onPicking: setBodyPicking,
                    message: bodyCommand && !bodyCommand.accepted ? bodyCommand.message : undefined,
                  } : undefined}
                  onSourceKindChange={mode => {
                    if (doc.features.some(feature => feature.id === editing.id) || sourceLoading
                      || sourceBuiltFeatures !== sourceFeatures || !sourceModel?.bodyCatalogActive) return;
                    const base = { ...editing };
                    delete base.bodyPattern;
                    delete base.featurePattern;
                    const targets = bodySelection.filter(reference => sourceModel.bodies?.some(body => sameBodyReference(body.ref, reference)))
                      .map(reference => ({ ...reference }));
                    let next: RepetitionFeature;
                    if (mode === 'features') {
                      const featureIds = editing.source.mode === 'features' ? [...editing.source.featureIds]
                        : editing.source.mode === 'bodies' ? [...new Set(editing.source.bodies.map(reference => reference.sourceFeatureId))]
                          : [editing.source.sourceFeatureId];
                      next = { ...base, source: { mode: 'features', geometryPattern: true, featureIds },
                        featurePattern: { mode: 'geometry', targets, bindings: [] },
                        ...(editing.type === 'mirror' ? { mergeBodies: false } : {}) } as RepetitionFeature;
                    } else {
                      next = { ...base, source: { mode: 'bodies', scope: 'current', bodies: targets },
                        bodyPattern: { mode: 'new', instances: [] },
                        ...(editing.type === 'mirror' ? { mergeBodies: false } : {}) } as RepetitionFeature;
                      if (targets.length) {
                        try { next = reconcileBodyPatternDraft(next); }
                        catch (error) { setError(error instanceof Error ? error.message : String(error)); return; }
                      }
                    }
                    setBodySelection(targets);
                    setBodyPicking(false);
                    setEditing(next);
                    setError('');
                  }}
                  onChange={(patch) => {
                    if ("support" in patch && patch.support)
                      changeSupport(patch.support);
                    else changeDraft(patch);
                  }}
                  pickingFace={pickingMirror}
                  onPickFace={() => setPickingSupport(!pickingSupport)}
                  canPickFace={
                    !sourceLoading &&
                    sourceSelectionDtos.faces.some((face) => face.frame)
                  }
                />
              ) : isEdgeFinish(editing) ? (
                <>
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
                {operationBodyEditor}
                {operationNameEditor}
                </>
              ) : (
                <>
                  <div className="property-section operation-profile-section">
                    <h3>
                      <ChevronDown size={12} /> Perfil seleccionado
                    </h3>
                    <select
                      aria-label="Croquis de la operación"
                      disabled={!!stagedSketch}
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
                  {isRevolutionFeature(editing) ? (
                    <>
                      <RevolvePanel feature={editing}
                        sketch={availableSketches.find(sketch => sketch.id === editing.sketchId)}
                        onChange={changeDraft}>
                        <NumberField
                          label="Ángulo"
                          value={editing.angle}
                          onChange={(angle) => changeDraft({ angle })}
                          unit="°"
                        />
                      </RevolvePanel>
                      {operationBodyEditor}
                      {operationNameEditor}
                    </>
                  ) : (
                    <>
                    <ExtrudePanel
                      feature={editing}
                      features={availableFeatures}
                      planes={availablePlanes}
                      baseFeatureId={
                        editing.type === "cut" && editing.bodyScope ? editing.bodyScope[0]?.sourceFeatureId ?? null
                          : editing.type === "extrude" && editing.bodyOperation?.mode === "merge" ? editing.bodyOperation.target.sourceFeatureId
                          : editing.type === "extrude" && editing.bodyOperation?.mode === "new" ? editing.endCondition && 'baseFeatureId' in editing.endCondition ? editing.endCondition.baseBody?.sourceFeatureId ?? null : null
                          : sourceModel?.faces?.[0]?.ref.sourceFeatureId ?? null
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
                        !!sourceSelectionDtos.faces.length && !sourceLoading
                      }
                      onTarget={changeEndTarget}
                      onPickFace={() => setPickingEndFace(!pickingExtrude)}
                      onChange={(patch) => {
                        changeDraft(patch);
                        if ("endCondition" in patch)
                          setPickingEndFace(
                            patch.endCondition?.kind === "upToSurface" &&
                              editing.endCondition?.kind !== "upToSurface" &&
                              !!sourceSelectionDtos.faces.length &&
                              !preferredEndPlane,
                          );
                      }}
                    />
                    {operationBodyEditor}
                    {operationNameEditor}
                    </>
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
              <div className="tree" ref={treeElement}>
                <button
                  type="button"
                  className="tree-document"
                  aria-expanded={treeOpen}
                  aria-controls="part-document-tree-content"
                  onClick={() => setTreeOpen(value => !value)}
                >
                  <ChevronDown size={12} className={treeOpen ? "" : "closed"} />
                  <Box size={18} />
                  <strong>{doc.name}</strong>
                  <span>{dirty ? "*" : ""}</span>
                </button>
                <div id="part-document-tree-content" hidden={!treeOpen}>
                    <div
                      className="tree-row subdued"
                      onClick={() => setPanel("properties")}
                    >
                      <ChevronRight size={11} />
                      <Info size={15} />
                      <span>Propiedades de la pieza</span>
                    </div>
                    {model?.bodyCatalogActive && <section className="part-body-catalog" aria-label="Catálogo de cuerpos sólidos">
                      <button type="button" className="part-body-catalog-toggle" ref={bodyCatalogButton}
                        aria-expanded={bodyCatalogOpen} aria-controls="part-body-catalog-content" onClick={toggleBodyCatalog}>
                        {bodyCatalogOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        <Box size={15} /><span>Cuerpos sólidos ({model.bodies?.length ?? 0})</span>
                        {unavailableBodySelection.length > 0 && <small className="part-body-catalog-warning">{unavailableBodySelection.length} {unavailableBodySelection.length === 1 ? "no disponible" : "no disponibles"}</small>}
                      </button>
                      <div id="part-body-catalog-content" ref={bodyCatalogContent} hidden={!bodyCatalogOpen}>
                        <BodyList compact bodies={model.bodies ?? []} selection={bodySelection} onSelection={chooseBodySelection} disabled={busy || !previewCurrent} />
                      </div>
                    </section>}
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
                          "tree-row plane " + (selected === p || !editing && normalReferences?.some(reference => reference.kind === 'principal' && reference.plane === p) ? "selected" : "")
                        }
                        key={p}
                        onClick={event => {
                          if (!editing) selectViewReference({ kind: 'principal', plane: p }, event.ctrlKey || event.metaKey);
                          else { setPlane(p); setSelected(p); setFaceSelection(null); }
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
                    {featureTree.map(group => (
                      <div key={group.feature.id}>
                        {row(group.feature)}
                        {group.children.length > 0 && <div id={partTreeChildrenId(group.feature.id)} hidden={!group.expanded}>
                          {group.expanded && group.children.map(feature => row(feature, group.feature.id))}
                        </div>}
                      </div>
                    ))}
                    <div className="rollback-bar">
                      <span />
                      <ChevronUp size={12} />
                    </div>
                </div>
              </div>
              <div className={`selection-tools${faceSelection ? " face-selection-summary" : ""}`} role="group"
                aria-label={faceSelection ? "Acciones de la cara seleccionada" : "Acciones de la operación seleccionada"}>
                <span title={faceSelection
                  ? `${faceSelection.frame ? "Cara plana seleccionada" : "Cara curva seleccionada"}: ${selectedFaceFeatureName}`
                  : selectedFeature?.name ?? "Selecciona una operación"}>
                  {faceSelection ? <>
                    <strong>{faceSelection.frame ? "Cara plana seleccionada" : "Cara curva seleccionada"}</strong>
                    {selectedFaceFeatureName && `: ${selectedFaceFeatureName}`}
                  </> : selectedFeature?.name ?? "Selecciona una operación"}
                </span>
                <div>
                  {faceSelection ? <>
                    <IconButton icon={Pencil} title="Crear croquis en cara" disabled={!faceSelection.frame} onClick={() => startSketch()}>
                      <span className="selection-action-label">Crear croquis en cara</span>
                    </IconButton>
                    <IconButton icon={PanelTop} title="Crear plano desde cara" disabled={!faceSelection.frame} onClick={startPlane}>
                      <span className="selection-action-label">Crear plano desde cara</span>
                    </IconButton>
                  </> : <>
                    <IconButton
                      icon={Pencil}
                      title="Editar operación"
                      disabled={!selectedFeature}
                      onClick={() => { if (selectedFeature) editFeature(selectedFeature); }}
                    />
                    <IconButton
                      icon={Eye}
                      title={
                        selectedFeature?.suppressed
                          ? "Activar operación"
                          : "Suprimir operación"
                      }
                      disabled={!selectedFeature}
                      onClick={() => {
                        if (selectedFeature) apply(
                          updateFeature(doc, selectedFeature.id, {
                            suppressed: !selectedFeature.suppressed,
                          }),
                        );
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      title="Eliminar operación"
                      disabled={!selectedFeature}
                      onClick={() => { if (selectedFeature) deleteSelected(); }}
                    />
                  </>}
                </div>
              </div>
              <div className="manager-footer">
                <span className="blue-dot" /> Configuración: Predeterminada
              </div>
            </>
          )}
        </aside>
        <section className="graphics-area" data-normal-selection-kind={normalTarget?.kind ?? 'invalid'} data-normal-selection-keys={JSON.stringify(normalReferences?.map(partViewReferenceKey) ?? [])} data-normal-enabled={canNormal}>
          <div className="viewport-toolbar">
            <ViewOrientationControls onView={changeView} canPrevious={viewHistory.canPrevious} canNormal={canNormal} disabled={!!viewIs2D || viewHistory.navigating} onNamedViews={namedViews.open} canNamedViews={namedViews.canOpen} />
            {!editing && normalReferences && normalReferences.length > 1 && <span className="normal-view-selection" title="Normal a: primera referencia de frente; segunda hacia arriba">{normalReferences.length} referencias</span>}
            <IconButton
              icon={Maximize}
              title="Ajustar a pantalla (F)"
              disabled={viewHistory.navigating}
              onClick={() => changeView("fit")}
            />
            <i />
            <IconButton
              icon={Box}
              title="Vista isométrica (Ctrl+7)"
              disabled={!!viewIs2D || viewHistory.navigating}
              onClick={() => changeView("iso")}
            />
            <IconButton
              icon={Square}
              title="Vista frontal (Ctrl+1)"
              disabled={!!viewIs2D || viewHistory.navigating}
              onClick={() => changeView("front")}
            />
            <IconButton
              icon={Layers}
              title="Vista superior (Ctrl+5)"
              disabled={!!viewIs2D || viewHistory.navigating}
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
            <div className="part-selection-controls" role="group" aria-label="Selección de pieza">
              {([
                ['auto', 'Auto', 'Selección automática'],
                ['face', 'Caras', 'Seleccionar caras'],
                ['edge', 'Aristas', 'Seleccionar aristas'],
                ['body', 'Cuerpos', 'Seleccionar cuerpos'],
              ] as const).map(([mode, label, title]) => <button key={mode}
                type="button" title={title} aria-label={title} data-part-selection-mode={mode}
                aria-pressed={viewportSelectionMode === mode} disabled={!!editing || busy || !previewCurrent}
                onClick={() => changeSelectionMode(mode)}>{label}</button>)}
              <button type="button" aria-label="Limpiar selección de pieza" title="Limpiar selección de pieza"
                disabled={!!editing || busy || !previewCurrent || !faceSelection && !edgeSelection.length && !bodySelection.length && !selected}
                onClick={clearBrowsingSelection}><X size={14} /></button>
            </div>
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
              profile={toolConvertedProfile ?? editing.profile}
              onReposition={repositionEntityPoints}
              onChange={(p) =>
                p.kind === "entities"
                  ? changeEntityProfile(p)
                  : changeDraft({ profile: p })
              }
              tool={sketchTool}
              plane={sketchPlaneShortLabel}
              referenceLines={referenceLines}
              selection={sketchSelection}
              onSelection={next => {
                if (sketchTool === "mirror") setMirrorPreview(null);
                if (sketchTool === "offset") setOffsetPreview(null);
                if (sketchTool === "fillet" && next.length > sketchSelection.length &&
                  next.length > 1 && next.every(item => item.kind === "point") &&
                  filletPreview?.sourceProfile === sketchSolution?.profile) {
                  const message = filletSelectionCheck.current?.(next);
                  if (message) { notify(message, true); return; }
                }
                setSketchSelection(next);
              }}
              solution={sketchSolution}
              fitStamp={sketchFitStamp}
              chamferPreview={sketchTool === "chamfer" ? chamferPreview : null}
              filletPreview={sketchTool === "fillet" ? filletPreview : null}
              mirrorPreview={sketchTool === "mirror" ? mirrorPreview : null}
              offsetPreview={sketchTool === "offset" ? offsetPreview : null}
              mirrorAxisEntityId={mirrorAxisId} mirrorPickingAxis={mirrorPickingAxis}
              onMirrorAxis={chooseMirrorAxis}
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
                fitStamp={sketchFitStamp}
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
              contextRevision={viewportContextFrame}
              onContextTarget={viewportContextBlocked ? undefined : openViewportContext}
              view={view}
              viewHistory={viewHistory}
              display={display}
              grid={grid}
              selected={
                !visibleModel?.bodyCatalogActive &&
                !!selectedFeature &&
                selectedFeature.type !== "sketch" &&
                selectedFeature.type !== "plane" &&
                (selectionMode === "auto" || selectionMode === "body") &&
                !finishEditing &&
                !faceEditing &&
                !extrudeEditing &&
                !holeEditing
              }
              selectionMode={viewportSelectionMode}
              selectionDisabled={!editing && (busy || !previewCurrent)}
              onClearSelection={!editing ? clearBrowsingSelection : undefined}
              selectedEdges={selectedEdges}
              selectedBodies={bodySelection}
              onSelectBody={(!editing && !busy && previewCurrent || !!editing && bodyPicking && !sourceLoading && sourceBuiltFeatures === sourceFeatures) ? toggleBody : undefined}
              onSelectEdge={toggleEdge}
              visibleSketchIds={visibleSketchIds}
              selectedSketchId={selectedSketchId}
              activeInputSketchIds={activeInputSketchIds}
              activeInputSketches={activeInputSketches}
              selectedFace={faceSelection?.ref}
              selectedFaces={
                pickingFaceOperation && !pickingSupport
                  ? operationFaces
                  : pickingExtrude &&
                      extrudeEditing?.endCondition?.kind === "upToSurface" &&
                      extrudeEditing.endCondition.target.kind === "face"
                    ? [extrudeEditing.endCondition.target.face]
                    : !editing ? normalReferences?.flatMap(reference => reference.kind === 'face' ? [reference.face] : []) ?? [] : []
              }
              onSelectFace={selectFace}
              selectedPlaneId={selectedPlaneId}
              selectedPlaneIds={!editing ? normalReferences?.flatMap(reference => reference.kind === 'feature' ? [reference.id] : []) : undefined}
              showPlanes={showPlanes}
              onSelectPlane={(id, additive = false) => {
                if (!editing) {
                  if (busy || !previewCurrent) return;
                  selectViewReference({ kind: 'feature', id }, additive);
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
                              : selectionMode === "auto"
                                ? faceSelection
                                  ? faceSelection.frame ? "Cara plana seleccionada" : "Cara curva seleccionada"
                                  : edgeSelection.length ? "Selección de aristas · " + edgeSelection.length + " seleccionadas" : "Selección automática · Caras y aristas"
                                : selectionMode === "face"
                                  ? faceSelection ? faceSelection.frame ? "Cara plana seleccionada" : "Cara curva seleccionada" : "Selecciona una cara"
                                  : selectionMode === "edge"
                                    ? "Selección de aristas · " + edgeSelection.length + " seleccionadas"
                                    : "Selección de cuerpos · " + bodySelection.length + " seleccionados"}
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
                  : view.name === "fit" || view.name === "previous"
                    ? "Vista de modelo"
                    : {
                        front: "Frontal",
                        back: "Posterior",
                        top: "Superior",
                        bottom: "Inferior",
                        left: "Izquierda",
                        right: "Derecha",
                        dimetric: "Dimétrica",
                        trimetric: "Trimétrica",
                        normal: "Normal a",
                        named: "Vista guardada",
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
                Clic: seleccionar <b>·</b> Rueda: zoom <b>·</b> Rueda pulsada: girar
                <b>·</b> Mayús + rueda pulsada: desplazar
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
                <button className="outline-button" onClick={newDoc} disabled={newDocumentBlocked}>
                  <Plus size={15} /> Nuevo documento
                </button>
                <button className="library-card" onClick={loadPartSequenceDemo}>
                  <Layers size={36} />
                  <strong>Cortes y salientes sucesivos</strong>
                  <span>Base y cuatro croquis preparados: dos cortes de 4 mm y salientes de 3 y 2 mm. Selecciona cada croquis en el árbol y añade su operación desde el menú superior. En los salientes, elige añadir material al cuerpo en las propiedades.</span>
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
                <button className="library-card" onClick={() => loadFilletBatchDemo()}>
                  <CornerDownRight size={36} />
                  <strong>Redondear varias esquinas</strong>
                  <span>Placa 10 × 6 × 4 mm · selecciona las dos esquinas inferiores y aplica R2</span>
                </button>
                <button className="library-card" onClick={() => loadSketchMirrorDemo("lines")}>
                  <FlipHorizontal2 size={36} /><strong>Simetría de medio perfil</strong>
                  <span>Croquis abierto · refleja los tres tramos sobre el eje de construcción</span>
                </button>
                <button className="library-card" onClick={() => loadSketchMirrorDemo("arc")}>
                  <FlipHorizontal2 size={36} /><strong>Simetría de un arco</strong>
                  <span>Semicírculo R5 · refleja el arco y comparte los puntos sobre el eje</span>
                </button>
                <button className="library-card" onClick={() => loadSketchOffsetDemo("rectangle")}>
                  <CopyPlus size={36} /><strong>Equidistancia de una placa</strong>
                  <span>Rectángulo 10 × 6 · crea un contorno paralelo con distancia editable</span>
                </button>
                <button className="library-card" onClick={() => loadSketchOffsetDemo("circle")}>
                  <CopyPlus size={36} /><strong>Equidistancia circular</strong>
                  <span>Círculo R3 · crea un anillo concéntrico y edita su separación</span>
                </button>
                <button className="library-card" onClick={() => loadSketchOffsetDemo("concave")}>
                  <CopyPlus size={36} /><strong>Equidistancia de un contorno en L</strong>
                  <span>Contorno cóncavo · compara el lado interior y el exterior</span>
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
        <button title="Nuevo documento" onClick={newDoc} disabled={newDocumentBlocked}>
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
      {(exporting || (importing && !discardOpen)) && (
        <div className="toast">
          <Loader2 size={17} className="spin" />
          {importing ? "Preparando importación STEP…" : "Exportando geometría…"}
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
      {namedViews.isOpen && <NamedViewsDialog views={namedViews.views} canSave={namedViews.canSave} canUpdate={namedViews.canUpdate}
        onSave={namedViews.save} onShow={namedViews.show} onDelete={namedViews.remove} onRename={namedViews.rename} onUpdate={namedViews.update} onClose={namedViews.close} />}
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
