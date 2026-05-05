import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, MoreVertical, Folder, X, Palette, Clock, Users, Archive, Trash2 } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { projectService, type Project } from '../../api/projectService';

function formatDuration(seconds: number): string {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export const ProjectsPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Create state
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    color: '#6366F1'
  });

  const colors = ['#6366F1', '#06B6D4', '#F43F5E', '#10B981', '#F59E0B', '#8B5CF6'];

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await projectService.getAll({
        search: searchTerm || undefined,
        is_active: statusFilter === 'active' ? 1 : 0,
      });
      setProjects(response.data);
    } catch (error) {
      console.error('Failed to fetch projects', error);
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    const timeout = setTimeout(fetchProjects, 300);
    return () => clearTimeout(timeout);
  }, [fetchProjects]);

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

  const handleArchive = async (id: number) => {
    try {
      await projectService.update(id, { is_active: 0 });
      fetchProjects();
    } catch (err) {
      console.error('Failed to archive project', err);
    }
    setMenuOpenId(null);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
    try {
      await projectService.delete(id);
      fetchProjects();
    } catch (err) {
      console.error('Failed to delete project', err);
    }
    setMenuOpenId(null);
  };

  return (
    <div className="space-y-8" onClick={() => setMenuOpenId(null)}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
          <p className="text-slate-400">Manage your work and team assignments.</p>
        </div>
        <Button className="w-fit" onClick={() => setShowCreateModal(true)}>
          <Plus className="w-5 h-5 mr-2" /> New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
          <Input
            placeholder="Search projects..."
            className="pl-12"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex rounded-xl overflow-hidden border border-white/10">
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-5 py-2.5 text-sm font-semibold transition-all ${statusFilter === 'active' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter('archived')}
            className={`px-5 py-2.5 text-sm font-semibold transition-all ${statusFilter === 'archived' ? 'bg-primary-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            Archived
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="glass-card animate-pulse h-64 border border-white/5"></div>
          ))
        ) : projects.length === 0 ? (
          <div className="col-span-3 text-center py-20 text-slate-500">
            <Folder size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">No projects found</p>
            <p className="text-sm mt-1">{searchTerm ? 'Try a different search term.' : 'Create your first project!'}</p>
          </div>
        ) : (
          projects.map((project) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ y: -4 }}
              className="glass-card flex flex-col justify-between group relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-white/5 transition-transform group-hover:scale-110" style={{ color: project.color }}>
                    <Folder size={24} />
                  </div>
                  <div className="relative">
                    <button
                      className="text-slate-500 hover:text-white transition-colors p-1"
                      onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === project.id ? null : project.id); }}
                    >
                      <MoreVertical size={20} />
                    </button>
                    <AnimatePresence>
                      {menuOpenId === project.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -5 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -5 }}
                          className="absolute right-0 top-8 z-50 w-44 glass border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                        >
                          <button
                            onClick={() => handleArchive(project.id)}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                          >
                            <Archive size={16} />
                            {project.is_active ? 'Archive' : 'Restore'}
                          </button>
                          <button
                            onClick={() => handleDelete(project.id)}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-accent hover:bg-accent/10 transition-colors"
                          >
                            <Trash2 size={16} />
                            Delete
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{project.name}</h3>
                <p className="text-slate-400 text-sm line-clamp-2">{project.description || <span className="italic opacity-50">No description</span>}</p>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between">
                {/* Member count */}
                <div className="flex items-center gap-2 text-slate-400">
                  <Users size={16} className="text-primary-400" />
                  <span className="text-sm font-medium">
                    {project.member_count ?? 0} member{project.member_count !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Time spent */}
                <div className="flex items-center gap-2 text-right">
                  <Clock size={14} className="text-primary-400" />
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Time Spent</p>
                    <p className="text-primary-400 font-mono text-sm">
                      {formatDuration(project.total_time_seconds ?? 0)}
                    </p>
                  </div>
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
