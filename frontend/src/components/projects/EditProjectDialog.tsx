import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Pencil } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Project } from "@/types/project";

type EditProjectDialogProps = {
  project: Project;
  onProjectUpdated: (project: Project) => void;
};

export function EditProjectDialog({ project, onProjectUpdated }: EditProjectDialogProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [goal, setGoal] = useState(project.goal);
  const [targetDate, setTargetDate] = useState(project.targetDate?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleOpenChange = (nextOpen: boolean) => {
    if (saving) return;
    if (nextOpen) {
      setName(project.name);
      setDescription(project.description);
      setGoal(project.goal);
      setTargetDate(project.targetDate?.slice(0, 10) ?? "");
      setError("");
    }
    setOpen(nextOpen);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) {
      setError("Enter a project name.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`http://localhost:3001/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), description: description.trim(), goal: goal.trim(), targetDate: targetDate || null,
        }),
      });
      if (response.status === 401) {
        navigate("/", { replace: true });
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Unable to update project. Please try again.");
        return;
      }
      onProjectUpdated(data.project);
      setOpen(false);
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}><Pencil aria-hidden="true" /> Edit project</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-sm" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>Update your project details. Only the name is required.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} onChange={() => setError("")} className="space-y-5">
          <fieldset disabled={saving} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-project-name">Project name</Label>
              <Input id="edit-project-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-project-description">Description (optional)</Label>
              <Textarea id="edit-project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-project-goal">Goal (optional)</Label>
              <Textarea id="edit-project-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={2000} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-project-date">Target date (optional)</Label>
              <Input id="edit-project-date" type="date" min="0001-01-01" max="9999-12-31" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
            </div>
          </fieldset>
          {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>Cancel</DialogClose>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
