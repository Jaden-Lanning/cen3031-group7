import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, LoaderCircle, Search, ShieldCheck, Users } from "lucide-react";
import { GoalSyncBrand } from "@/components/GoalSyncBrand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

export function AdminPage() {
  const navigate = useNavigate();
  const [access, setAccess] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [viewerId, setViewerId] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const loadUsers = async () => {
      setAccess("loading");
      setUsers([]);
      setError("");
      setNotice("");
      try {
        const response = await fetch("http://localhost:3001/api/me", {
          credentials: "include", signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          navigate("/", { replace: true });
          return;
        }
        if (!response.ok) throw new Error("Unable to verify your access. Please try again.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (data.user.role !== "admin") {
          setAccess("forbidden");
          return;
        }
        setViewerId(data.user.id);

        const usersResponse = await fetch("http://localhost:3001/api/admin/users", {
          credentials: "include", signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (usersResponse.status === 401) {
          navigate("/", { replace: true });
          return;
        }
        if (usersResponse.status === 403) {
          setAccess("forbidden");
          return;
        }
        if (!usersResponse.ok) throw new Error("Unable to load users. Please try again.");
        const usersData = await usersResponse.json();
        if (controller.signal.aborted) return;
        setUsers(usersData.users);
        setAccess("ready");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "Unable to connect to the server. Please try again.");
        setAccess("error");
      }
    };
    loadUsers();
    return () => controller.abort();
  }, [navigate, loadAttempt]);

  const handleRoleChange = async (user: AdminUser, role: "user" | "admin") => {
    if (user.id === viewerId || updatingIds.includes(user.id) || role === user.role) return;
    setUpdatingIds((current) => [...current, user.id]);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${encodeURIComponent(user.id)}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (response.status === 401) {
        setUsers([]);
        setAccess("loading");
        navigate("/", { replace: true });
        return;
      }
      if (response.status === 403) {
        setUsers([]);
        setAccess("forbidden");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || "Unable to update this user's role.");
        return;
      }
      setUsers((current) => current.map((item) => item.id === data.user.id ? data.user : item));
      setNotice(`${data.user.name}'s role is now ${data.user.role === "admin" ? "Admin" : "User"}.`);
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setUpdatingIds((current) => current.filter((id) => id !== user.id));
    }
  };

  const query = search.trim().toLowerCase();
  const visibleUsers = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-card/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <Link to="/home" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"><GoalSyncBrand /></Link>
          <Link to="/home" className={buttonVariants({ variant: "ghost" })}><ArrowLeft aria-hidden="true" /> Back to dashboard</Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10">
        {access === "loading" ? (
          <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> Checking admin access...</div>
        ) : access === "forbidden" ? (
          <section className="empty-state min-h-64">
            <ShieldCheck className="mb-2 size-9 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-foreground">Admin access required</h1>
            <p>Your account does not have access to user management.</p>
            <Link to="/home" className={buttonVariants({ className: "mt-3" })}>Return to dashboard</Link>
          </section>
        ) : access === "error" ? (
          <section className="space-y-4">
            <h1 className="text-2xl font-semibold">Unable to open user management</h1>
            <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>
            <Button variant="outline" onClick={() => setLoadAttempt((current) => current + 1)}>Try again</Button>
          </section>
        ) : (
          <>
            <section className="workspace-banner mb-8 rounded-2xl border bg-card p-6 sm:p-8">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary"><ShieldCheck className="size-4" aria-hidden="true" /> ADMINISTRATION</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Admin Dashboard</h1>
              <p className="mt-3 text-muted-foreground">View Goal Sync accounts and manage access.</p>
            </section>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <CardTitle><h2 className="flex items-center gap-2"><Users className="size-5 text-primary" aria-hidden="true" /> Registered users <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{users.length}</span></h2></CardTitle>
                  <div className="flex w-full items-center gap-2 rounded-lg border border-input bg-background pl-5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 sm:w-72">
                    <Search className="pointer-events-none ml-4 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <label htmlFor="admin-user-search" className="sr-only">Search users by name or email</label>
                    <Input id="admin-user-search" className="h-10 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                </div>
                <CardDescription>Admins can manage user roles. Your own role cannot be changed here.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert>}
                {notice && <p role="status" className="break-words rounded-lg bg-primary/5 p-3 text-sm text-primary">{notice}</p>}
                {visibleUsers.length === 0 ? (
                  <div className="empty-state min-h-40"><Users className="size-7 text-primary" aria-hidden="true" /><p className="font-medium text-foreground">{users.length === 0 ? "No registered users" : "No matching users"}</p><p>{users.length === 0 ? "Registered accounts will appear here." : "Try a different name or email."}</p></div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Registered users and role management</caption>
                      <thead className="border-b border-primary/15 bg-primary/5 text-sm text-foreground">
                        <tr>
                          <th scope="col" className="px-4 py-4 font-semibold leading-6 tracking-wide">Name</th>
                          <th scope="col" className="px-4 py-4 font-semibold leading-6 tracking-wide">Email</th>
                          <th scope="col" className="px-4 py-4 font-semibold leading-6 tracking-wide">Role</th>
                          <th scope="col" className="px-4 py-4 font-semibold leading-6 tracking-wide">Joined</th>
                          <th scope="col" className="px-4 py-4 font-semibold leading-6 tracking-wide">Manage role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {visibleUsers.map((user) => (
                          <tr key={user.id} className="transition-colors hover:bg-muted/30">
                            <th scope="row" className="min-w-40 max-w-64 break-words px-4 py-4 font-medium">{user.name}{user.id === viewerId && <span className="ml-2 text-xs font-normal text-muted-foreground">{" "}(You)</span>}</th>
                            <td className="max-w-72 break-words px-4 py-4 text-muted-foreground">{user.email}</td>
                            <td className="px-4 py-4"><span className={`rounded-md px-2 py-1 text-xs font-medium capitalize ${user.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{user.role}</span></td>
                            <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{new Date(user.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                            <td className="px-4 py-4">
                              {user.id === viewerId ? <span className="text-xs text-muted-foreground">Your account</span> : (
                                <div className="flex items-center gap-2">
                                  <select aria-label={`Role for ${user.name}`} value={user.role} disabled={updatingIds.includes(user.id)} onChange={(event) => handleRoleChange(user, event.target.value as "user" | "admin")} className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-50">
                                    <option value="user">User</option><option value="admin">Admin</option>
                                  </select>
                                  {updatingIds.includes(user.id) && <span role="status"><LoaderCircle className="size-4 animate-spin text-primary" aria-hidden="true" /><span className="sr-only">Saving role</span></span>}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {query && <p className="text-xs text-muted-foreground">Showing {visibleUsers.length} of {users.length} users</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
