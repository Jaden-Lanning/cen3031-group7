import { Route, Routes } from "react-router";

import { AuthPage } from "@/pages/AuthPage";
import { HomePage } from "@/pages/HomePage";
import { CreateProjectPage } from "@/pages/CreateProjectPage";
import { ProjectPage } from "@/pages/ProjectPage";
import { AdminPage } from "@/pages/AdminPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthPage />} />
      <Route path="/home" element={<HomePage />} />
      <Route path="/projects/new" element={<CreateProjectPage />} />
      <Route path="/projects/:projectId" element={<ProjectPage />} />
      <Route path="/admin" element={<AdminPage />} />
    </Routes>
  );
}

export default App;
