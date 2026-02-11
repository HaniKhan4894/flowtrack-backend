import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, MoreVertical, Folder, X, Palette } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { projectService, type Project } from '../../api/projectService';

export const ProjectsPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Create state
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    color: '#6366F1'
  });

  const colors = ['#6366F1', '#06B6D4', '#F43F5E', '#10B981', '#F59E0B', '#8B5CF6'];

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const response = await projectService.getAll();
      setProjects(response.data);
    } catch (error) {
      console.error('Failed to fetch projects', error);
      // Fallback dummy data for design preview
      setProjects([
        { id: 1, name: 'FlowTrack SaaS', description: 'Main product development', status: 'active', color: '#6366F1', organization_id: 1 },
        { id: 2, name: 'Marketing Website', description: 'Landing page and blog', status: 'active', color: '#06B6D4', organization_id: 1 },
        { id: 3, name: 'Mobile App', description: 'iOS and Android tracking app', status: 'active', color: '#F43F5E', organization_id: 1 },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await projectService.create({ ...newProject, organization_id: 1 });
      setShowCreateModal(false);
      setNewProject({ name: '', description: '', color: '#6366F1' });
      fetchProjects();
    } catch (error) {
      console.error('Failed to create project', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
          <p className="text-slate-400">Manage your work and team assignments.</p>
        </div>
        <Button className="w-fit" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-5 h-5 mr-2" /> New Project
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
          <Input placeholder="Search projects..." className="pl-12" />
        </div>
        <Button variant="secondary" className="px-4">
          Status: Active
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="glass-card animate-pulse h-64 border border-white/5"></div>
          ))
        ) : (
          projects.map((project) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ y: -4 }}
              className="glass-card flex flex-col justify-between group"
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-white/5 transition-transform group-hover:scale-110" style={{ color: project.color }}>
                    <Folder size={24} />
                  </div>
                  <button className="text-slate-500 hover:text-white transition-colors">
                    <MoreVertical size={20} />
                  </button>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{project.name}</h3>
                <p className="text-slate-400 text-sm line-clamp-2">{project.description}</p>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                <div className="flex -space-x-2">
                   {[1, 2].map(i => (
                     <div key={i} className="w-8 h-8 rounded-full border-2 border-[#12141C] bg-surface-200"></div>
                   ))}
                   <div className="w-8 h-8 rounded-full border-2 border-[#12141C] bg-primary-500/20 text-primary-400 text-[10px] flex items-center justify-center font-bold">
                    +4
                   </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Time Spent</p>
                  <p className="text-primary-400 font-mono">42h 15m</p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Create Project Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg glass-card border border-white/10 p-8 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold text-white">Create New Project</h2>
                <button onClick={() => setShowCreateModal(false)} className="text-slate-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Project Name</label>
                  <Input 
                    value={newProject.name}
                    onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                    placeholder="e.g. Website Redesign" 
                    required 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Description</label>
                  <textarea 
                    value={newProject.description}
                    onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                    placeholder="Briefly describe what this project is about..."
                    className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 outline-none transition-all resize-none"
                    required
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1 flex items-center gap-2">
                    <Palette size={16} /> Project Color
                  </label>
                  <div className="flex gap-4">
                    {colors.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setNewProject({...newProject, color})}
                        className={`w-10 h-10 rounded-xl transition-all ${newProject.color === color ? 'ring-4 ring-primary-500/50 scale-110' : 'hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <Button variant="secondary" type="button" className="flex-1" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" isLoading={isCreating}>
                    Create Project
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProjectsPage;
