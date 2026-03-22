import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Plus, X, ChevronDown, ChevronUp, Search, ExternalLink, Settings2, Loader2, UtensilsCrossed, ChefHat, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Meal = "breakfast" | "lunch" | "dinner";
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
const MEAL_LABELS: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };

const SOURCES = [
  { value: "all", label: "All Italian sites" },
  { value: "giallozafferano", label: "Giallo Zafferano" },
  { value: "cucchiaio", label: "Cucchiaio d'Argento" },
  { value: "lacucinaitaliana", label: "La Cucina Italiana" },
];

interface Ingredient { id: number; meal: string; name: string; }
interface Criteria { meal: string; calories: number; protein: number; fiber: number; fat: number; gl: number; }
interface RecipeNutrition { calories: number; protein: number; fat: number; fiber: number; carbs: number; gl: number; }
interface Recipe { id: number; title: string; image: string; sourceUrl: string; sourceName: string; usedIngredientCount: number; missedIngredientCount: number; nutrition: RecipeNutrition; }

export default function Menus() {
  const [activeMeal, setActiveMeal] = useState<Meal>("breakfast");
  const [newIngredient, setNewIngredient] = useState("");
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [criteriaForm, setCriteriaForm] = useState<Record<Meal, Criteria | null>>({ breakfast: null, lunch: null, dinner: null });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeCriteria, setRecipeCriteria] = useState<Criteria | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [source, setSource] = useState("all");
  const [maxGl, setMaxGl] = useState("");
  const qc = useQueryClient();
  const { toast } = useToast();

  // Fetch ingredients for active meal
  const { data: ingredients = [] } = useQuery<Ingredient[]>({
    queryKey: ['/api/menu-ingredients', activeMeal],
    queryFn: async () => {
      const r = await fetch(`/api/menu-ingredients?meal=${activeMeal}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  // Fetch criteria for active meal
  const { data: criteria } = useQuery<Criteria>({
    queryKey: ['/api/meal-criteria', activeMeal],
    queryFn: async () => {
      const r = await fetch(`/api/meal-criteria/${activeMeal}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  // Sync criteria into form state when data arrives (TanStack Query v5 — no onSuccess option)
  useEffect(() => {
    if (criteria) {
      setCriteriaForm(prev => ({ ...prev, [activeMeal]: criteria }));
    }
  }, [criteria, activeMeal]);

  const form = criteriaForm[activeMeal] || criteria || { meal: activeMeal, calories: 500, protein: 30, fiber: 8, fat: 20, gl: 20 };

  // Add ingredient mutation
  const addIngredient = useMutation({
    mutationFn: async (name: string) => {
      const r = await fetch('/api/menu-ingredients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meal: activeMeal, name }), credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/menu-ingredients', activeMeal] }); setNewIngredient(""); },
    onError: () => toast({ variant: "destructive", title: "Error", description: "Failed to add ingredient." }),
  });

  // Delete ingredient mutation
  const deleteIngredient = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/menu-ingredients/${id}`, { method: 'DELETE', credentials: "include" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/menu-ingredients', activeMeal] }); },
  });

  // Save criteria mutation
  const saveCriteria = useMutation({
    mutationFn: async (data: Omit<Criteria, 'meal'>) => {
      const r = await fetch(`/api/meal-criteria/${activeMeal}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/meal-criteria', activeMeal] });
      toast({ title: "Saved", description: "Nutrition targets updated." });
    },
  });

  const handleAddIngredient = () => {
    const val = newIngredient.trim();
    if (!val) return;
    addIngredient.mutate(val);
  };

  const handleSearch = async () => {
    setSearching(true);
    setSearchError(null);
    setRecipes([]);
    setRecipeCriteria(null);
    try {
      const params = new URLSearchParams({ meal: activeMeal });
      if (source !== "all") params.set("source", source);
      if (maxGl.trim()) params.set("maxGl", maxGl.trim());
      const r = await fetch(`/api/recipes/search?${params}`, { credentials: "include" });
      const data = await r.json();
      if (!r.ok) { setSearchError(data.message || "Search failed"); return; }
      setRecipes(data.results);
      setRecipeCriteria(data.criteria);
      if (data.results.length === 0) setSearchError("No Italian recipes found matching your ingredients and criteria. Try adding more ingredients or relaxing the targets.");
    } catch { setSearchError("Network error. Please try again."); }
    finally { setSearching(false); }
  };

  const matchScore = (nutrition: RecipeNutrition, crit: Criteria) => {
    const checks = [
      Math.abs(nutrition.calories - crit.calories) / crit.calories <= 0.3,
      Math.abs(nutrition.protein - crit.protein) / crit.protein <= 0.3,
      Math.abs(nutrition.fiber - crit.fiber) / Math.max(crit.fiber, 1) <= 0.4,
      Math.abs(nutrition.fat - crit.fat) / Math.max(crit.fat, 1) <= 0.4,
      Math.abs(nutrition.gl - crit.gl) / Math.max(crit.gl, 1) <= 0.4,
    ];
    return checks.filter(Boolean).length;
  };

  const nutrientColor = (actual: number, target: number, higherIsBetter = false) => {
    const ratio = actual / Math.max(target, 1);
    if (higherIsBetter) return ratio >= 0.7 && ratio <= 1.5 ? "text-green-600" : ratio >= 0.5 ? "text-amber-500" : "text-red-500";
    return ratio >= 0.7 && ratio <= 1.3 ? "text-green-600" : ratio >= 0.5 && ratio <= 1.6 ? "text-amber-500" : "text-red-500";
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b border-border/40">
        <div className="container max-w-5xl mx-auto px-4 h-12 flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" />
            <h1 className="font-bold text-sm tracking-tight">MENUS</h1>
          </div>
          <div className="ml-auto flex gap-1 bg-slate-100/50 p-0.5 rounded-full border border-slate-200/60">
            {MEALS.map(m => (
              <button key={m} onClick={() => { setActiveMeal(m); setRecipes([]); setSearchError(null); }}
                className={cn("px-3 py-1 text-xs font-semibold rounded-full transition-all", activeMeal === m ? "bg-white shadow-sm text-primary border border-slate-200/80" : "text-muted-foreground hover:text-foreground")}>
                {MEAL_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Two-column: left = ingredients + criteria, right = recipes */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* LEFT: Ingredients + Criteria */}
          <div className="lg:col-span-2 space-y-4">

            {/* Ingredients */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                  My {MEAL_LABELS[activeMeal]} Ingredients
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. pasta, tomatoes..."
                    value={newIngredient}
                    onChange={e => setNewIngredient(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddIngredient(); }}
                    className="text-sm h-8"
                  />
                  <Button size="sm" onClick={handleAddIngredient} disabled={!newIngredient.trim() || addIngredient.isPending} className="h-8 px-3">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1.5 min-h-[60px]">
                  {ingredients.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4 italic">No ingredients yet. Add your favourite {activeMeal} foods above.</p>
                  ) : (
                    ingredients.map(ing => (
                      <div key={ing.id} className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 rounded-md border border-slate-100 group">
                        <span className="text-sm capitalize">{ing.name}</span>
                        <button onClick={() => deleteIngredient.mutate(ing.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Criteria / Admin */}
            <Card>
              <CardHeader className="pb-2 cursor-pointer" onClick={() => setCriteriaOpen(!criteriaOpen)}>
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    Nutrition Targets
                  </div>
                  {criteriaOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </CardTitle>
              </CardHeader>
              {criteriaOpen && (
                <CardContent className="space-y-3 pt-0">
                  <p className="text-[11px] text-muted-foreground">Target nutrition per {activeMeal} meal. Recipes are filtered to match these values (±30%).</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'calories', label: 'Calories (kcal)' },
                      { key: 'protein', label: 'Protein (g)' },
                      { key: 'fiber', label: 'Fiber (g)' },
                      { key: 'fat', label: 'Fat (g)' },
                      { key: 'gl', label: 'GL' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
                        <Input
                          type="number"
                          className="h-8 text-sm mt-0.5"
                          value={(form as any)[key] || ''}
                          onChange={e => setCriteriaForm(prev => ({ ...prev, [activeMeal]: { ...(prev[activeMeal] || form), [key]: Number(e.target.value) } }))}
                        />
                      </div>
                    ))}
                  </div>
                  <Button size="sm" className="w-full h-8 text-xs" onClick={() => saveCriteria.mutate({ calories: form.calories, protein: form.protein, fiber: form.fiber, fat: form.fat, gl: form.gl })} disabled={saveCriteria.isPending}>
                    {saveCriteria.isPending ? "Saving..." : "Save Targets"}
                  </Button>
                </CardContent>
              )}
            </Card>

            {/* Search Options */}
            <Card>
              <CardContent className="pt-3 pb-3 space-y-3">
                {/* Source dropdown */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-1">
                    <Globe className="h-3 w-3" /> Recipe Source
                  </label>
                  <select
                    value={source}
                    onChange={e => setSource(e.target.value)}
                    className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {/* Max GL */}
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Max GL filter</label>
                  <Input
                    type="number"
                    placeholder="e.g. 20 (no limit if empty)"
                    value={maxGl}
                    onChange={e => setMaxGl(e.target.value)}
                    className="h-8 text-sm"
                    min={0}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Search Button */}
            <Button className="w-full" onClick={handleSearch} disabled={searching || ingredients.length === 0}>
              {searching ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Searching Italian recipes...</> : <><Search className="h-4 w-4 mr-2" />Find Italian Recipes</>}
            </Button>
            {ingredients.length === 0 && <p className="text-[11px] text-muted-foreground text-center">Add ingredients to search for recipes.</p>}
          </div>

          {/* RIGHT: Recipe Results */}
          <div className="lg:col-span-3 space-y-3">
            {searchError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">{searchError}</div>
            )}
            {!searching && recipes.length === 0 && !searchError && (
              <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground space-y-2">
                <ChefHat className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">No recipes yet</p>
                <p className="text-xs">Add your favourite ingredients and click "Find Italian Recipes"</p>
              </div>
            )}
            {recipes.map(recipe => {
              const score = recipeCriteria ? matchScore(recipe.nutrition, recipeCriteria) : null;
              return (
                <Card key={recipe.id} className="overflow-hidden">
                  <div className="flex gap-0">
                    {recipe.image && (
                      <img src={recipe.image} alt={recipe.title} className="w-24 h-24 object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold hover:text-primary flex items-start gap-1">
                            {recipe.title} <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0 opacity-60" />
                          </a>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {recipe.usedIngredientCount} of your ingredients used
                            {recipe.missedIngredientCount > 0 && ` · ${recipe.missedIngredientCount} extra needed`}
                            {recipe.sourceName && <span className="ml-1 text-muted-foreground/60">· {recipe.sourceName}</span>}
                          </p>
                        </div>
                        {score !== null && (
                          <Badge variant={score >= 4 ? "default" : score >= 2 ? "secondary" : "outline"} className={cn("text-[10px] flex-shrink-0", score >= 4 ? "bg-green-100 text-green-800 border-green-200 hover:bg-green-100" : score >= 2 ? "bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100" : "")}>
                            {score}/5 match
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-center">
                        {[
                          { label: 'Cal', actual: recipe.nutrition.calories, target: recipeCriteria?.calories },
                          { label: 'Pro', actual: recipe.nutrition.protein, target: recipeCriteria?.protein, suffix: 'g' },
                          { label: 'Fib', actual: recipe.nutrition.fiber, target: recipeCriteria?.fiber, suffix: 'g' },
                          { label: 'Fat', actual: recipe.nutrition.fat, target: recipeCriteria?.fat, suffix: 'g' },
                          { label: 'GL', actual: recipe.nutrition.gl, target: recipeCriteria?.gl },
                        ].map(({ label, actual, target, suffix = '' }) => (
                          <div key={label} className="bg-slate-50 rounded-md p-1.5">
                            <div className="text-[9px] font-medium text-muted-foreground uppercase">{label}</div>
                            <div className={cn("text-xs font-bold font-mono", target ? nutrientColor(actual, target) : "")}>
                              {actual}{suffix}
                            </div>
                            {target && <div className="text-[8px] text-muted-foreground/70">tgt:{target}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
