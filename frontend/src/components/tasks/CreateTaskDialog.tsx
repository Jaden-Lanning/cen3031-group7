import { useState } from "react";
import { Plus } from "lucide-react";
import { Link } from "react-router";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  createdAt: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: TaskPriority;
  completedAt: string | null;
  userId: string;
  projectId: string | null;
};

type CreateTaskDialogProps = {
  projects: { id: string; name: string }[];
  projectsError?: string;
  onTaskCreated: (task: Task) => void;
};

export function CreateTaskDialog({ projects, projectsError, onTaskCreated }: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = () => {
    setProjectId("");
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("medium");
    setMessage("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      resetForm();
    }
  };

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();

    if (projectsError || !projects.some((project) => project.id === projectId)) {
      setMessage("Select one of your projects before creating a task.");
      return;
    }

    setMessage("");
    setSubmitting(true);

    try {
      const response = await fetch("http://localhost:3001/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate || null,
          priority,
          projectId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.message);
        return;
      }

      onTaskCreated(data.task);
      handleOpenChange(false);
    } catch (error) {
      console.error(error);
      setMessage("Unable to connect to the server");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="icon-sm" aria-label="Create task" />
        }
      >
        <Plus />
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
          <DialogDescription>
            Add a new task to keep track of what needs to be done.
          </DialogDescription>
        </DialogHeader>

        {projectsError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{projectsError}</AlertDescription>
          </Alert>
        ) : projects.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Tasks belong to projects. Create a project first, then add your tasks.</p>
            <Link to="/projects/new" className={buttonVariants()}>Create a project</Link>
          </div>
        ) : (
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-project">Project</Label>
            <select
              id="task-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
              className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="" disabled>Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              type="text"
              placeholder="What needs to be done?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              placeholder="Add any details (optional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-due-date">Due date</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <select
                id="task-priority"
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as TaskPriority)
                }
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          {message && (
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting || !projectId}>
              {submitting ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
