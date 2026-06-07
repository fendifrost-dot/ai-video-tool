import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "avt.projectRail.collapsed";

type ProjectRailContextValue = {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
};

const ProjectRailContext = createContext<ProjectRailContextValue>({
  collapsed: false,
  setCollapsed: () => {},
});

export function ProjectRailProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <ProjectRailContext.Provider value={{ collapsed, setCollapsed }}>
      {children}
    </ProjectRailContext.Provider>
  );
}

export function useProjectRail() {
  return useContext(ProjectRailContext);
}

export function useProjectRailCollapsed() {
  return useContext(ProjectRailContext).collapsed;
}
