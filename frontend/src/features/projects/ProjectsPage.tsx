import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, MoreVertical, Folder, Palette, Clock, Users, Archive, Trash2, ChevronDown, ChevronUp, ListTodo } from 'lucide-react';
import { Button, Input, Modal } from '../../components/ui';
import { projectService, type Project } from '../../api/projectService';
import { clientService, type Client } from '../../api/clientService';
import { useAuthStore } from '../../store/authStore';
import { taskService } from '../../api/taskService';
import type { Task } from '../../types';
import { hasPermission } from '../../utils/access';
import { getApiErrorMessage } from '../../utils/apiError';

function formatDuration(seconds: number): string {
  if (!seconds) return '0h 0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export const ProjectsPage = () => {
  const { user } = useAuthStore();
  const canEditProjects = hasPermission(user, 'projects.edit');
  const canCreateProjects = hasPermission(user, 'projects.create');
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived'>('active');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [projectTasks, setProjectTasks] = useState<Record<number, Task[]>>({});
  const [tasksLoading, setTasksLoading] = useState<number | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskProjectId, setTaskProjectId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({ name: '', description: '', estimated_hours: '' });
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Create state
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    color: '#6366F1',
    client_id: '' as string | number,
    budget_hours: '',
    budget_amount: '',
  });

  const colors = ['#6366F1', '#06B6D4', '#F43F5E', '#10B981', '#F59E0B', '#8B5CF6'];

  useEffect(() => {
    clientService.getAll({ is_active: 1 }).then((r) => setClients(r.data ?? [])).catch(() => undefined);
  }, []);

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
      await projectService.create({
        ...newProject,
        organization_id: user?.organization_id,
        client_id: newProject.client_id ? Number(newProject.client_id) : undefined,
        budget_hours: newProject.budget_hours ? parseFloat(newProject.budget_hours) : undefined,
        budget_amount: newProject.budget_amount ? parseFloat(newProject.budget_amount) : undefined,
      });
      setShowCreateModal(false);
      setNewProject({ name: '', description: '', color: '#6366F1', client_id: '', budget_hours: '', budget_amount: '' });
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

  const loadTasks = async (projectId: number) => {
    setTasksLoading(projectId);
    try {
      const resp = await taskService.getAll({ project_id: projectId, is_active: 1 });
      setProjectTasks((prev) => ({ ...prev, [projectId]: resp.data ?? [] }));
    } catch (err) {
      console.error('Failed to load tasks', err);
      setProjectTasks((prev) => ({ ...prev, [projectId]: [] }));
    } finally {
      setTasksLoading(null);
    }
  };

  const toggleExpand = (projectId: number) => {
    if (expandedId === projectId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(projectId);
    if (!projectTasks[projectId]) {
      loadTasks(projectId);
    }
  };

  const openTaskModal = (projectId: number, task?: Task) => {
    setTaskProjectId(projectId);
    setEditingTask(task ?? null);
    setTaskForm({
      name: task?.name ?? '',
      description: task?.description ?? '',
      estimated_hours: task?.estimated_hours != null ? String(task.estimated_hours) : '',
    });
    setTaskError(null);
    setShowTaskModal(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskProjectId) return;
    setTaskSaving(true);
    setTaskError(null);
    try {
      const payload = {
        name: taskForm.name,
        description: taskForm.description || undefined,
        estimated_hours: taskForm.estimated_hours ? Number(taskForm.estimated_hours) : undefined,
      };
      if (editingTask) {
        await taskService.update(editingTask.id, payload);
      } else {
        await taskService.create({ project_id: taskProjectId, ...payload });
      }
      setShowTaskModal(false);
      await loadTasks(taskProjectId);
    } catch (err) {
      setTaskError(getApiErrorMessage(err, 'Failed to save task'));
    } finally {
      setTaskSaving(false);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (!confirm(`Delete task "${task.name}"?`)) return;
    try {
      await taskService.delete(task.id);
      await loadTasks(task.project_id);
    } catch (err) {
      console.error('Failed to delete task', err);
    }
  };

  return (
    <div className="space-y-8" onClick={() => setMenuOpenId(null)}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Projects</h1>
          <p className="text-slate-400">Manage your work and team assignments.</p>
        </div>
        {canCreateProjects && (
          <Button className="w-fit" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-5 h-5 mr-2" /> New Project
          </Button>
        )}
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

              <div className="mt-4">
                <button
                  onClick={() => toggleExpand(project.id)}
                  className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-primary-400 transition-colors"
                >
                  <ListTodo size={14} />
                  Tasks
                  {expandedId === project.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {expandedId === project.id && (
                  <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                    {tasksLoading === project.id ? (
                      <p className="text-xs text-slate-500">Loading tasks…</p>
                    ) : (projectTasks[project.id]?.length ?? 0) === 0 ? (
                      <p className="text-xs text-slate-500">No tasks yet.</p>
                    ) : (
                      projectTasks[project.id]?.map((task) => (
                        <div key={task.id} className="flex items-center justify-between gap-2 text-sm bg-white/5 rounded-lg px-3 py-2">
                          <span className="text-slate-200 truncate">{task.name}</span>
                          {canEditProjects && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => openTaskModal(project.id, task)}
                                className="text-xs text-primary-400 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task)}
                                className="text-xs text-rose-400 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    {canEditProjects && (
                      <button
                        onClick={() => openTaskModal(project.id)}
                        className="text-xs font-bold text-primary-400 hover:underline"
                      >
                        + Add task
                      </button>
                    )}
                  </div>
                )}
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
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Project">
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

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Client</label>
            <select
              className="form-select"
              value={newProject.client_id}
              onChange={(e) => setNewProject({ ...newProject, client_id: e.target.value })}
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Budget Hours</label>
              <Input
                type="number"
                step="0.5"
                value={newProject.budget_hours}
                onChange={(e) => setNewProject({ ...newProject, budget_hours: e.target.value })}
                placeholder="e.g. 120"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Budget Amount</label>
              <Input
                type="number"
                step="0.01"
                value={newProject.budget_amount}
                onChange={(e) => setNewProject({ ...newProject, budget_amount: e.target.value })}
                placeholder="e.g. 5000"
              />
            </div>
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
      </Modal>

      {/* Task Modal */}
      <Modal
        open={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        title={editingTask ? 'Edit Task' : 'New Task'}
        size="sm"
      >
        {taskError && <p className="text-rose-400 text-sm mb-4">{taskError}</p>}
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Name</label>
            <Input value={taskForm.name} onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Description</label>
            <textarea
              value={taskForm.description}
              onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-400 uppercase tracking-wider ml-1">Estimated hours</label>
            <Input
              type="number"
              min="0"
              step="0.25"
              value={taskForm.estimated_hours}
              onChange={(e) => setTaskForm((f) => ({ ...f, estimated_hours: e.target.value }))}
            />
          </div>
          <div className="flex gap-4 pt-2">
            <Button variant="secondary" type="button" className="flex-1" onClick={() => setShowTaskModal(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" isLoading={taskSaving}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ProjectsPage;
