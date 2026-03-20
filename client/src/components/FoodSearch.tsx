import { useState, useRef, useCallback } from "react";
import { Search, Loader2, X, Check, Mic, MicOff } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface NutritionPer100g {
  calories: number;
  protein: number;
  fiber: number;
  fat: number;
  carbs: number;
  gl: number;
}

interface FoodResult {
  name: string;
  per100g: NutritionPer100g;
}

interface FoodSearchProps {
  date: string;
  meal: string;
}

type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T } ? T : any;

export function FoodSearch({ date, meal }: FoodSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);
  const [grams, setGrams] = useState("100");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/food-search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setResults(data);
      if (data.length === 0) {
        toast({ title: "No results", description: `No foods found for "${searchQuery}".` });
      }
    } catch {
      setResults([]);
      toast({ variant: "destructive", title: "Error", description: "Search failed." });
    }
    setSearching(false);
  }, [toast]);

  const handleSearch = async () => {
    await doSearch(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ variant: "destructive", title: "Not supported", description: "Speech recognition is not available in this browser. Try Chrome or Safari." });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = () => {
        setListening(true);
        setTranscript("");
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        let interimTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        const currentTranscript = finalTranscript || interimTranscript;
        setTranscript(currentTranscript);
        setQuery(currentTranscript);
      };

      recognition.onend = () => {
        setListening(false);
        const currentQuery = recognitionRef.current?._lastTranscript || "";
        if (currentQuery.length >= 2) {
          doSearch(currentQuery);
        }
      };

      recognition.onerror = (event: any) => {
        setListening(false);
        if (event.error === "not-allowed") {
          toast({ variant: "destructive", title: "Microphone blocked", description: "Please allow microphone access in your browser settings." });
        } else if (event.error === "no-speech") {
          toast({ title: "No speech detected", description: "Try speaking again." });
        } else if (event.error !== "aborted") {
          toast({ variant: "destructive", title: "Voice error", description: `Speech recognition error: ${event.error}` });
        }
      };

      const origOnResult = recognition.onresult;
      recognition.onresult = (event: any) => {
        let finalT = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalT += event.results[i][0].transcript;
          }
        }
        if (finalT) {
          recognition._lastTranscript = finalT;
        } else {
          let interimT = "";
          for (let i = 0; i < event.results.length; i++) {
            interimT += event.results[i][0].transcript;
          }
          recognition._lastTranscript = interimT;
        }
        const currentTranscript = recognition._lastTranscript;
        setTranscript(currentTranscript);
        setQuery(currentTranscript);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Could not start voice recognition." });
    }
  }, [toast, doSearch]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
  }, [listening, startListening, stopListening]);

  const handleSelectFood = (food: FoodResult) => {
    setSelectedFood(food);
    setGrams("100");
    setDialogOpen(true);
  };

  const createCustomLog = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/custom-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/custom-logs", date] });
      setDialogOpen(false);
      setSelectedFood(null);
      setQuery("");
      setResults([]);
      setTranscript("");
      toast({ title: "Added", description: "Custom food logged." });
    },
  });

  const handleConfirm = () => {
    if (!selectedFood) return;
    const g = parseInt(grams) || 0;
    if (g <= 0) return;
    const factor = g / 100;
    createCustomLog.mutate({
      foodName: selectedFood.name,
      grams: g,
      calories: Math.round(selectedFood.per100g.calories * factor),
      protein: Math.round(selectedFood.per100g.protein * factor),
      fiber: Math.round(selectedFood.per100g.fiber * factor),
      fat: Math.round(selectedFood.per100g.fat * factor),
      gl: Math.round(selectedFood.per100g.gl * factor),
      meal,
      date,
    });
  };

  const gramsNum = parseInt(grams) || 0;
  const factor = gramsNum / 100;

  return (
    <div className="space-y-2" data-testid="food-search">
      <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Search Food</h3>
      <div className="flex gap-1.5">
        <Input
          placeholder={listening ? "Listening..." : "Type or speak a food..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn("h-9 text-sm", listening && "border-red-400 animate-pulse")}
          data-testid="input-food-search"
        />
        <Button
          size="icon"
          variant={listening ? "destructive" : "outline"}
          onClick={toggleVoice}
          title={listening ? "Stop listening" : "Voice search"}
          data-testid="button-voice-search"
        >
          {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={handleSearch}
          disabled={searching || query.length < 2}
          data-testid="button-food-search"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      {transcript && (
        <div className="text-[10px] text-muted-foreground italic px-1" data-testid="text-voice-transcript">
          Heard: "{transcript}"
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto" data-testid="food-search-results">
          {results.map((food, i) => (
            <button
              key={i}
              onClick={() => handleSelectFood(food)}
              className="w-full text-left px-2.5 py-2 rounded-md border border-slate-200 hover-elevate transition-colors"
              data-testid={`food-result-${i}`}
            >
              <div className="text-xs font-medium truncate">{food.name}</div>
              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {food.per100g.calories} cal | P:{food.per100g.protein}g | F:{food.per100g.fiber}g | Fat:{food.per100g.fat}g | GL:{food.per100g.gl}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-lg">{selectedFood?.name}</DialogTitle>
            <DialogDescription>Enter grams eaten. Values shown per 100g.</DialogDescription>
          </DialogHeader>

          {selectedFood && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Per 100g</div>
                  <div className="flex justify-between"><span>Calories</span><span className="font-mono">{selectedFood.per100g.calories}</span></div>
                  <div className="flex justify-between"><span>Protein</span><span className="font-mono">{selectedFood.per100g.protein}g</span></div>
                  <div className="flex justify-between"><span>Fiber</span><span className="font-mono">{selectedFood.per100g.fiber}g</span></div>
                  <div className="flex justify-between"><span>Fat</span><span className="font-mono">{selectedFood.per100g.fat}g</span></div>
                  <div className="flex justify-between"><span>GL</span><span className="font-mono">{selectedFood.per100g.gl}</span></div>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Your portion ({gramsNum}g)</div>
                  <div className="flex justify-between"><span>Calories</span><span className="font-mono font-semibold">{Math.round(selectedFood.per100g.calories * factor)}</span></div>
                  <div className="flex justify-between"><span>Protein</span><span className="font-mono font-semibold">{Math.round(selectedFood.per100g.protein * factor)}g</span></div>
                  <div className="flex justify-between"><span>Fiber</span><span className="font-mono font-semibold">{Math.round(selectedFood.per100g.fiber * factor)}g</span></div>
                  <div className="flex justify-between"><span>Fat</span><span className="font-mono font-semibold">{Math.round(selectedFood.per100g.fat * factor)}g</span></div>
                  <div className="flex justify-between"><span>GL</span><span className="font-mono font-semibold">{Math.round(selectedFood.per100g.gl * factor)}</span></div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Grams eaten</label>
                <Input
                  type="number"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value)}
                  min={1}
                  className="h-9 text-sm font-mono"
                  data-testid="input-food-grams"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-food-cancel">
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={gramsNum <= 0 || createCustomLog.isPending}
              data-testid="button-food-confirm"
            >
              {createCustomLog.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              Add to {meal}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
