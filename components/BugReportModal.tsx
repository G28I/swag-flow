"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bug, X, Upload, CheckCircle2, AlertCircle, Loader2, Image as ImageIcon } from "lucide-react";
import { getAnonToken } from "@/app/lib/anonToken";

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type BugCategory = "ui" | "stream" | "model" | "other";

export const BugReportModal: React.FC<BugReportModalProps> = ({ isOpen, onClose }) => {
  const [category, setCategory] = useState<BugCategory>("ui");
  const [description, setDescription] = useState("");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMessage("Please select a valid image file (PNG, JPG, WebP, GIF).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage("Image size must be less than 5MB.");
      return;
    }

    setErrorMessage(null);
    setImageName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageData(result);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageData(null);
    setImageName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMessage("Please enter a description of the bug.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const anonToken = getAnonToken();
      const pageUrl = typeof window !== "undefined" ? window.location.href : "";

      const res = await fetch("/api/arena/bug-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anon-token": anonToken,
        },
        body: JSON.stringify({
          category,
          description: description.trim(),
          imageData,
          pageUrl,
          anonToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit bug report.");
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setDescription("");
        setImageData(null);
        setImageName(null);
        setCategory("ui");
        onClose();
      }, 1800);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit bug report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const categories: { id: BugCategory; label: string }[] = [
    { id: "ui", label: "UI / Visual" },
    { id: "stream", label: "Stream Failure" },
    { id: "model", label: "Model Output" },
    { id: "other", label: "Other / General" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        ref={modalRef}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border-custom bg-card-bg shadow-2xl transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-custom px-6 py-4 bg-muted/40">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Bug className="h-5 w-5" />
            </div>
            <div>
              <h2 id="bug-modal-title" className="text-lg font-semibold text-foreground">
                Report a Bug
              </h2>
              <p className="text-xs text-muted-foreground">Found an issue? Let us know so we can fix it.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        {isSuccess ? (
          <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3 animate-bounce" />
            <h3 className="text-xl font-semibold text-foreground">Thank You!</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Your bug report has been submitted successfully.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {errorMessage && (
              <div className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Category Selector */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Issue Category</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`rounded-xl px-3 py-2 text-xs font-medium border transition-all ${
                      category === cat.id
                        ? "border-accent bg-accent/15 text-accent shadow-sm"
                        : "border-border-custom bg-secondary/50 text-muted-foreground hover:border-accent/40 hover:text-foreground"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description Textarea */}
            <div>
              <label htmlFor="bug-description" className="block text-xs font-medium text-muted-foreground mb-1.5">
                Description <span className="text-accent">*</span>
              </label>
              <textarea
                id="bug-description"
                rows={4}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what happened, steps to reproduce, or unexpected behavior..."
                className="w-full rounded-xl border border-border-custom bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none transition-colors"
              />
            </div>

            {/* Image Attachment Section */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Attach Screenshot (Optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
                id="bug-image-upload"
              />

              {imageData ? (
                <div className="relative flex items-center gap-3 rounded-xl border border-border-custom bg-secondary/40 p-2.5">
                  <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-border-custom bg-black">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageData} alt="Bug screenshot preview" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{imageName || "Screenshot attached"}</p>
                    <p className="text-[10px] text-emerald-400 font-medium">Ready to attach</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    title="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="bug-image-upload"
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-custom bg-secondary/20 p-4 cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-all text-center"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent mb-1.5">
                    <Upload className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-medium text-foreground">Click to upload screenshot</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, WebP (max 5MB)</span>
                </label>
              )}
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border-custom/60">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !description.trim()}
                className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-white shadow-md hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Bug className="h-3.5 w-3.5" />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
