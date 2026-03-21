import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, Pencil, Eye, EyeOff, RotateCcw, Trash2, Check, X,
  ChevronDown, ChevronUp, Settings, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { BOX_DATA } from "@shared/schema";

type BoxEntry = {
  id: number;
  name: string;
  group: string;
  macros: { calories: number; protein: number; fiber: number; fat: number; gl: number };
  increment: number;
  examples: string[];
  hero13: number;
  satietyPer100kcal: number;
  hidden?: boolean;
  isCustom?: boolean;
  customized?: boolean;
  customizationId?: number | null;
};

type EditForm = {
  name: string;
  calories: string;
  protein: string;
  fiber: string;
  fat: string;
  gl: string;
  increment: string;
  examples: string;
  group: "matrix" | "buttons";
};

const defaultForm = (): EditForm => ({
  name: "", calories: "", protein: "", fiber: "", fat: "", gl: "",
  increment: "10", examples: "", group: "buttons",
});

function boxToForm(box: BoxEntry): EditForm {
  return {
    name: box.name,
    calories: String(box.macros.calories),
    protein: String(box.macros.protein),
    fiber: String(box.macros.fiber),
    fat: String(box.macros.fat),
    gl: String(box.macros.gl),
    increment: String(box.increment),
    examples: box.examples.join(", "),
    group: (box.group === "matrix" ? "matrix" : "buttons") as "matrix" | "buttons",
  };
}

function formToPayload(form: EditForm) {
  return {
    name: form.name.trim(),
    calories: Number(form.calories),
    protein: Number(form.protein),
    fiber: Number(form.fiber),
    fat: Number(form.fat),
    gl: Number(form.gl),
    increment: Number(form.increment),
    examples: form.examples.split(",").map(s => s.trim()).filter(Boolean),
    group: form.group,
  };
}

export default function Admin() {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>(defaultForm());
  const [addingNew, setAddingNew] = useState(false);
  const [newForm, setNewForm] = useState<EditForm>(defaultForm());
  const [showHidden, setShowHidden] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: boxes = [], isLoading } = useQuery<BoxEntry[]>({
    queryKey: ['/api/admin/boxes'],
    queryFn: async () => {
      const r = await fetch('/api/admin/boxes', { credentials: 'include' });
      if (!r.ok) throw new Error('Failed');
      const data = await r.json();
      return Object.values(data as Record<string, BoxEntry>).sort((a, b) => a.id - b.id);
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['/api/admin/boxes'] });
    qc.invalidateQueries({ queryKey: ['/api/boxes'] });
  };

  const updateBox = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/admin/boxes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => { invalidate(); setEditingId(null); toast({ title: "Saved", description: "Box updated." }); },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to save." }),
  });

  const createBox = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch('/api/admin/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => {
      invalidate();
      setAddingNew(false);
      setNewForm(defaultForm());
      toast({ title: "Created", description: "New food box added to dashboard." });
    },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to create box." }),
  });

  const toggleHide = useMutation({
    mutationFn: async ({ id, hidden }: { id: number; hidden: boolean }) => {
      if (hidden) {
        // Restore: delete customization for built-ins, or un-hide
        const box = boxes.find(b => b.id === id);
        if (box?.isCustom) {
          // Custom box: just un-hide
          const r = await fetch(`/api/admin/boxes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hidden: false }),
            credentials: 'include',
          });
          if (!r.ok) throw new Error('Failed');
        } else {
          // Built-in: restore (delete customization that has hidden=1)
          const r = await fetch(`/api/admin/boxes/${id}/restore`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!r.ok) throw new Error('Failed');
        }
      } else {
        const r = await fetch(`/api/admin/boxes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hidden: true }),
          credentials: 'include',
        });
        if (!r.ok) throw new Error('Failed');
      }
    },
    onSuccess: (_, { hidden }) => {
      invalidate();
      toast({ title: hidden ? "Box restored" : "Box hidden", description: hidden ? "Box is now visible on the dashboard." : "Box is now hidden from the dashboard." });
    },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to update visibility." }),
  });

  const deleteBox = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/boxes/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) throw new Error('Failed');
    },
    onSuccess: () => { invalidate(); toast({ title: "Deleted", description: "Custom box deleted." }); },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to delete." }),
  });

  const restoreDefaults = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/admin/boxes/${id}/restore`, { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error('Failed');
    },
    onSuccess: () => { invalidate(); setEditingId(null); toast({ title: "Restored", description: "Box reset to default values." }); },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to restore." }),
  });

  const startEdit = (box: BoxEntry) => {
    setEditForm(boxToForm(box));
    setEditingId(box.id);
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = (id: number) => {
    updateBox.mutate({ id, data: formToPayload(editForm) });
  };

  const visibleBoxes = boxes.filter(b => !b.hidden);
  const hiddenBoxes = boxes.filter(b => b.hidden);

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b border-border/40">
        <div className="container max-w-5xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-sm tracking-tight">ADMIN · Food Boxes</h1>
          </div>
          <div className="ml-auto flex gap-2">
            {hiddenBoxes.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowHidden(!showHidden)} className="h-8 text-xs gap-1.5">
                <EyeOff className="h-3.5 w-3.5" />
                {showHidden ? "Hide" : `Show ${hiddenBoxes.length} hidden`}
              </Button>
            )}
            <Button size="sm" onClick={() => { setAddingNew(true); setNewForm(defaultForm()); }} className="h-8 text-xs gap-1.5" disabled={addingNew}>
              <Plus className="h-3.5 w-3.5" />
              New Box
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-4">

        {/* Add New Box Form */}
        {addingNew && (
          <Card className="border-primary/40 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                New Custom Food Box
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BoxForm form={newForm} onChange={setNewForm} />
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={() => createBox.mutate(formToPayload(newForm))} disabled={!newForm.name.trim() || createBox.isPending} className="h-8 text-xs">
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {createBox.isPending ? "Creating..." : "Create Box"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddingNew(false)} className="h-8 text-xs">
                  <X className="h-3.5 w-3.5 mr-1" />Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="flex justify-center py-12 text-muted-foreground text-sm">Loading boxes...</div>
        )}

        {/* Visible Boxes */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1 flex items-center gap-2">
            <Eye className="h-3.5 w-3.5" />
            Active Boxes ({visibleBoxes.length})
          </h2>
          {visibleBoxes.map(box => (
            <BoxRow
              key={box.id}
              box={box}
              isEditing={editingId === box.id}
              editForm={editForm}
              onEditFormChange={setEditForm}
              onStartEdit={() => startEdit(box)}
              onCancelEdit={cancelEdit}
              onSaveEdit={() => saveEdit(box.id)}
              onHide={() => toggleHide.mutate({ id: box.id, hidden: false })}
              onRestoreDefaults={() => restoreDefaults.mutate(box.id)}
              onDelete={() => deleteBox.mutate(box.id)}
              savePending={updateBox.isPending}
            />
          ))}
        </div>

        {/* Hidden Boxes */}
        {showHidden && hiddenBoxes.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pl-1 flex items-center gap-2">
              <EyeOff className="h-3.5 w-3.5" />
              Hidden Boxes ({hiddenBoxes.length})
            </h2>
            {hiddenBoxes.map(box => (
              <BoxRow
                key={box.id}
                box={box}
                isEditing={false}
                editForm={editForm}
                onEditFormChange={setEditForm}
                onStartEdit={() => startEdit(box)}
                onCancelEdit={cancelEdit}
                onSaveEdit={() => saveEdit(box.id)}
                onHide={() => toggleHide.mutate({ id: box.id, hidden: true })}
                onRestoreDefaults={() => restoreDefaults.mutate(box.id)}
                onDelete={() => deleteBox.mutate(box.id)}
                savePending={updateBox.isPending}
                dimmed
              />
            ))}
          </div>
        )}

      </main>
    </div>
  );
}

// ─── BoxRow ──────────────────────────────────────────────────────────────────

interface BoxRowProps {
  box: BoxEntry;
  isEditing: boolean;
  editForm: EditForm;
  onEditFormChange: (f: EditForm) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onHide: () => void;
  onRestoreDefaults: () => void;
  onDelete: () => void;
  savePending?: boolean;
  dimmed?: boolean;
}

function BoxRow({
  box, isEditing, editForm, onEditFormChange, onStartEdit, onCancelEdit,
  onSaveEdit, onHide, onRestoreDefaults, onDelete, savePending, dimmed,
}: BoxRowProps) {
  const isBuiltIn = !!BOX_DATA[box.id];

  return (
    <Card className={cn("overflow-hidden transition-opacity", dimmed && "opacity-50")}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          {/* Left: ID + name + badges */}
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded w-7 text-center flex-shrink-0">
              {box.id}
            </span>
            {!isEditing ? (
              <div className="min-w-0">
                <span className="font-semibold text-sm">{box.name}</span>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{box.group}</Badge>
                  {box.isCustom && <Badge className="text-[9px] h-4 px-1 bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100">custom</Badge>}
                  {box.customized && !box.isCustom && <Badge className="text-[9px] h-4 px-1 bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">edited</Badge>}
                </div>
              </div>
            ) : (
              <Input value={editForm.name} onChange={e => onEditFormChange({ ...editForm, name: e.target.value })}
                className="h-7 text-sm font-semibold w-40" placeholder="Name" />
            )}
          </div>

          {/* Right: macros (read mode) or action buttons */}
          {!isEditing ? (
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                <span>{box.macros.calories} kcal</span>
                <span>P:{box.macros.protein}g</span>
                <span>F:{box.macros.fiber}g</span>
                <span>Fat:{box.macros.fat}g</span>
                <span>GL:{box.macros.gl}</span>
                <span className="text-[9px] text-primary font-semibold">H13:{box.hero13}</span>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={onStartEdit} title="Edit" className="h-7 w-7">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {!dimmed ? (
                  <Button size="icon" variant="ghost" onClick={onHide} title="Hide from dashboard" className="h-7 w-7 text-muted-foreground">
                    <EyeOff className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" onClick={onHide} title="Show on dashboard" className="h-7 w-7 text-green-600">
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                )}
                {box.isCustom && (
                  <Button size="icon" variant="ghost" onClick={onDelete} title="Delete custom box" className="h-7 w-7 text-destructive/70 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                {box.customized && !box.isCustom && (
                  <Button size="icon" variant="ghost" onClick={onRestoreDefaults} title="Restore defaults" className="h-7 w-7 text-amber-600">
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button size="sm" onClick={onSaveEdit} disabled={savePending} className="h-7 text-xs px-2">
                <Check className="h-3.5 w-3.5 mr-1" />Save
              </Button>
              <Button size="sm" variant="outline" onClick={onCancelEdit} className="h-7 text-xs px-2">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Edit form */}
        {isEditing && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <BoxForm form={editForm} onChange={onEditFormChange} />
            {isBuiltIn && box.customized && (
              <button onClick={onRestoreDefaults} className="mt-2 text-[11px] text-amber-600 hover:text-amber-700 flex items-center gap-1">
                <RotateCcw className="h-3 w-3" />Reset to factory defaults
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── BoxForm ─────────────────────────────────────────────────────────────────

function BoxForm({ form, onChange }: { form: EditForm; onChange: (f: EditForm) => void }) {
  const set = (key: keyof EditForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...form, [key]: e.target.value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          { key: 'calories' as const, label: 'Calories (kcal)' },
          { key: 'protein' as const, label: 'Protein (g)' },
          { key: 'fiber' as const, label: 'Fiber (g)' },
          { key: 'fat' as const, label: 'Fat (g)' },
          { key: 'gl' as const, label: 'Glycemic Load' },
          { key: 'increment' as const, label: 'Step size (g)' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
            <Input type="number" className="h-8 text-sm mt-0.5" value={form[key]} onChange={set(key)} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Panel</label>
          <select
            className="mt-0.5 w-full h-8 text-sm rounded-md border border-input bg-background px-3 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
            value={form.group}
            onChange={e => onChange({ ...form, group: e.target.value as "matrix" | "buttons" })}
          >
            <option value="matrix">Matrix (main grid)</option>
            <option value="buttons">Sidebar (add-ons)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Examples (comma-separated)</label>
          <Input className="h-8 text-sm mt-0.5" value={form.examples} onChange={set('examples')} placeholder="e.g. pasta, rice, bread" />
        </div>
      </div>
    </div>
  );
}
