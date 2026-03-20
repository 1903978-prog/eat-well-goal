import { motion, AnimatePresence } from "framer-motion";
import { type BoxDefinition } from "@shared/schema";
import { Info, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BoxButtonProps {
  box: BoxDefinition;
  count: number;
  totalGrams: number;
  onLog: () => void;
  onReset?: () => void;
  className?: string;
  variant?: 'matrix' | 'sidebar';
  alert?: boolean;
}

export function BoxButton({ box, count, totalGrams, onLog, onReset, className, variant = 'matrix', alert = false }: BoxButtonProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [justClicked, setJustClicked] = useState(false);

  const handleClick = () => {
    onLog();
    setJustClicked(true);
    setTimeout(() => setJustClicked(false), 500);
  };

  const getColorClass = () => {
    if (alert) return "bg-red-100 border-red-300 text-red-900";
    if (box.group === 'buttons') return "border-slate-200 text-slate-700";
    if ([1, 7, 15].includes(box.id)) return "border-green-200 text-green-800";
    if ([4, 5, 6, 14].includes(box.id)) return "border-blue-200 text-blue-800";
    if ([2, 8, 12, 16].includes(box.id)) return "border-orange-200 text-orange-800";
    if ([3, 10, 11].includes(box.id)) return "border-yellow-200 text-yellow-800";
    if (box.id === 9) return "border-pink-200 text-pink-800";
    return "border-slate-200 text-slate-700";
  };

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleClick}
        className={cn(
          "relative group rounded-lg transition-all duration-200 flex flex-col items-center justify-center shadow-sm",
          totalGrams > 0 ? "border-[3px] !border-blue-500" : "border",
          getColorClass(),
          variant === 'sidebar' ? "h-16 w-full p-2" : "h-full w-full p-2",
          className
        )}
        data-testid={`box-button-${box.id}`}
      >
        <div className="flex flex-col items-center text-center z-10 w-full">
          <span className={cn(
            "font-bold leading-tight",
            variant === 'sidebar' ? "text-[11px]" : "text-xs mb-0.5"
          )}>
            {box.name}
          </span>
          
          <div className="flex items-baseline gap-0.5">
            <span className={cn("font-mono font-semibold tracking-tighter opacity-90", variant === 'sidebar' ? "text-lg" : "text-2xl")}>
              {totalGrams > 0 ? totalGrams : 0}
            </span>
            <span className="text-[9px] font-medium uppercase opacity-60">g</span>
          </div>
          <div className="flex gap-1.5 text-[8px] font-medium uppercase tracking-wider opacity-50">
            <span>H:{box.hero13}</span>
            <span>S:{box.satietyPer100kcal}</span>
          </div>

          {totalGrams > 0 && onReset && (
            <div
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              className="absolute top-0.5 right-0.5 p-0.5 rounded-full hover:bg-black/10 transition-colors z-20"
              data-testid={`button-reset-box-${box.id}`}
            >
              <RotateCcw className="w-2.5 h-2.5 opacity-40 hover:opacity-80" />
            </div>
          )}
        </div>

        <div 
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setShowInfo(true); }}
          className="absolute bottom-1 right-1 p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-opacity z-20 focus:opacity-100"
        >
          <Info className="w-3 h-3 opacity-60" />
        </div>

        {/* Feedback Animation */}
        <AnimatePresence>
          {justClicked && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 0 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-current opacity-10 rounded-xl"
            />
          )}
        </AnimatePresence>
      </motion.button>

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              {box.name}
              <span className="text-sm font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded-full">
                ID: {box.id}
              </span>
            </DialogTitle>
            <DialogDescription>
              Nutritional values per 100g reference.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-muted-foreground">Macros (per 100g)</h4>
              <ul className="text-sm space-y-1">
                <li className="flex justify-between"><span>Calories</span> <span>{box.macros.calories}</span></li>
                <li className="flex justify-between"><span>Protein</span> <span>{box.macros.protein}g</span></li>
                <li className="flex justify-between"><span>Carbs (Fiber)</span> <span>{box.macros.fiber}g</span></li>
                <li className="flex justify-between"><span>Fat</span> <span>{box.macros.fat}g</span></li>
                <li className="flex justify-between"><span>GL</span> <span>{box.macros.gl}</span></li>
              </ul>
            </div>
            
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-muted-foreground">Scores</h4>
              <ul className="text-sm space-y-1">
                <li className="flex justify-between"><span>Hero13</span> <span className="font-bold">{box.hero13}</span></li>
                <li className="flex justify-between"><span>Sat/100kcal</span> <span className="font-bold">{box.satietyPer100kcal}</span></li>
              </ul>
              <h4 className="text-sm font-medium text-muted-foreground mt-4">Examples</h4>
              <ul className="text-sm list-disc list-inside text-muted-foreground">
                {box.examples.length > 0 ? (
                  box.examples.map((ex, i) => <li key={i}>{ex}</li>)
                ) : (
                  <li>Standard reference</li>
                )}
              </ul>
            </div>
          </div>
          
          <div className="bg-muted/50 p-3 rounded-lg text-xs text-center text-muted-foreground">
            Clicking adds <strong>{box.increment}g</strong> to your daily log.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
