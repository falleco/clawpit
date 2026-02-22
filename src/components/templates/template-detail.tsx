import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageCircle,
  Pencil,
  Play,
  Plug,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Switch,
} from '@/components/ui';
import { useTemplateStore, useWizardStore } from '@/stores';
import type { TeamMember } from '@/types';

interface TemplateDetailProps {
  templateId: string | null;
  clawpitDir: string;
  onClose?: () => void;
  onStartInstance?: () => void;
}

interface CommunicationConfig {
  discord?: string;
  telegram?: string;
  whatsapp?: string;
}

interface MemberConfig {
  enabled: boolean;
  customName?: string;
  skills: Record<string, boolean>;
  plugins: Record<string, boolean>;
  communication: CommunicationConfig;
}

// Available plugins that can be enabled
const AVAILABLE_PLUGINS = [
  { id: 'web-search', name: 'Web Search', description: 'Search the internet' },
  {
    id: 'code-interpreter',
    name: 'Code Interpreter',
    description: 'Execute code',
  },
  {
    id: 'file-browser',
    name: 'File Browser',
    description: 'Browse and manage files',
  },
  {
    id: 'image-gen',
    name: 'Image Generation',
    description: 'Generate images with AI',
  },
];

export function TemplateDetail({
  templateId,
  clawpitDir,
  onClose,
  onStartInstance,
}: TemplateDetailProps) {
  const { selectedTemplate, isLoading, error, selectTemplate, clearSelection } =
    useTemplateStore();
  const { updateData, updateInstance } = useWizardStore();
  const [memberConfigs, setMemberConfigs] = useState<
    Record<string, MemberConfig>
  >({});
  const [instanceName, setInstanceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (templateId) {
      void selectTemplate(templateId);
    } else {
      clearSelection();
    }
  }, [templateId, selectTemplate, clearSelection]);

  // Initialize member configs when template loads
  useEffect(() => {
    if (selectedTemplate) {
      const configs: Record<string, MemberConfig> = {};
      for (const member of selectedTemplate.members) {
        // Initialize skills as all enabled
        const skills: Record<string, boolean> = {};
        for (const skill of member.skills) {
          skills[skill] = true;
        }
        // Initialize plugins as all disabled
        const plugins: Record<string, boolean> = {};
        for (const plugin of AVAILABLE_PLUGINS) {
          plugins[plugin.id] = false;
        }
        configs[member.id] = {
          enabled: true,
          skills,
          plugins,
          communication: {},
        };
      }
      setMemberConfigs(configs);
      setInstanceName(selectedTemplate.name);
    }
  }, [selectedTemplate]);

  const handleMemberToggle = useCallback(
    (memberId: string, enabled: boolean) => {
      setMemberConfigs((prev) => ({
        ...prev,
        [memberId]: { ...prev[memberId], enabled },
      }));
    },
    [],
  );

  const handleNameChange = useCallback(
    (memberId: string, customName: string) => {
      setMemberConfigs((prev) => ({
        ...prev,
        [memberId]: { ...prev[memberId], customName },
      }));
    },
    [],
  );

  const handleSkillToggle = useCallback(
    (memberId: string, skillId: string, enabled: boolean) => {
      setMemberConfigs((prev) => ({
        ...prev,
        [memberId]: {
          ...prev[memberId],
          skills: { ...prev[memberId].skills, [skillId]: enabled },
        },
      }));
    },
    [],
  );

  const handlePluginToggle = useCallback(
    (memberId: string, pluginId: string, enabled: boolean) => {
      setMemberConfigs((prev) => ({
        ...prev,
        [memberId]: {
          ...prev[memberId],
          plugins: { ...prev[memberId].plugins, [pluginId]: enabled },
        },
      }));
    },
    [],
  );

  const handleCommunicationChange = useCallback(
    (memberId: string, platform: keyof CommunicationConfig, value: string) => {
      setMemberConfigs((prev) => ({
        ...prev,
        [memberId]: {
          ...prev[memberId],
          communication: {
            ...prev[memberId].communication,
            [platform]: value || undefined,
          },
        },
      }));
    },
    [],
  );

  const enabledMemberCount = Object.values(memberConfigs).filter(
    (c) => c.enabled,
  ).length;

  const handleCreateInstance = async () => {
    if (!selectedTemplate || !instanceName.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    try {
      // Get enabled members with their configs
      const enabledMembers = selectedTemplate.members.filter(
        (m) => memberConfigs[m.id]?.enabled,
      );

      // Update wizard data with template config
      updateData({
        clawpitDir,
        templateId: selectedTemplate.id,
        templateMembers: enabledMembers.map((m) => {
          const config = memberConfigs[m.id];
          return {
            id: m.id,
            name: config?.customName || m.name,
            skills: Object.entries(config?.skills || {})
              .filter(([, enabled]) => enabled)
              .map(([id]) => id),
            plugins: Object.entries(config?.plugins || {})
              .filter(([, enabled]) => enabled)
              .map(([id]) => id),
            communication: config?.communication,
          };
        }),
      });

      // Update instance name separately
      updateInstance({
        name: instanceName.trim(),
      });

      // Call the callback to navigate to setup wizard
      onStartInstance?.();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCreating(false);
    }
  };

  if (!templateId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Select a template to view details
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div className="space-y-2">
          <X className="mx-auto h-12 w-12 text-destructive/50" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedTemplate) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Hero Header with Team Image */}
      <div className="relative h-72 shrink-0 overflow-hidden">
        {/* Background Image */}
        {selectedTemplate.image ? (
          <img
            src={convertFileSrc(selectedTemplate.image)}
            alt={selectedTemplate.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-primary/5" />
        )}

        {/* Dark Gradient Overlay (bottom to top) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

        {/* Close Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-2 top-2 text-white/80 hover:bg-white/20 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>

        {/* Text Content */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <h2 className="text-xl font-semibold text-white">
            {selectedTemplate.name}
          </h2>
          <p className="mt-1 text-sm text-white/80">
            {selectedTemplate.description}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Instance name */}
        <div className="space-y-2">
          <Label htmlFor="instance-name">Instance Name</Label>
          <Input
            id="instance-name"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="Enter instance name"
          />
        </div>

        {/* Team members */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Team Members</h3>
            <span className="text-xs text-muted-foreground">
              {enabledMemberCount} of {selectedTemplate.members.length} enabled
            </span>
          </div>

          {selectedTemplate.members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              config={
                memberConfigs[member.id] || {
                  enabled: true,
                  skills: {},
                  plugins: {},
                  communication: {},
                }
              }
              onToggle={(enabled) => handleMemberToggle(member.id, enabled)}
              onNameChange={(name) => handleNameChange(member.id, name)}
              onSkillToggle={(skillId, enabled) =>
                handleSkillToggle(member.id, skillId, enabled)
              }
              onPluginToggle={(pluginId, enabled) =>
                handlePluginToggle(member.id, pluginId, enabled)
              }
              onCommunicationChange={(platform, value) =>
                handleCommunicationChange(member.id, platform, value)
              }
            />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-4 space-y-3">
        {createError && (
          <p className="text-sm text-destructive">{createError}</p>
        )}

        <Button
          className="w-full"
          disabled={
            isCreating || !instanceName.trim() || enabledMemberCount === 0
          }
          onClick={() => void handleCreateInstance()}
        >
          {isCreating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Deploy {enabledMemberCount} Agent
              {enabledMemberCount === 1 ? '' : 's'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface MemberCardProps {
  member: TeamMember;
  config: MemberConfig;
  onToggle: (enabled: boolean) => void;
  onNameChange: (name: string) => void;
  onSkillToggle: (skillId: string, enabled: boolean) => void;
  onPluginToggle: (pluginId: string, enabled: boolean) => void;
  onCommunicationChange: (
    platform: keyof CommunicationConfig,
    value: string,
  ) => void;
}

function MemberCard({
  member,
  config,
  onToggle,
  onNameChange,
  onSkillToggle,
  onPluginToggle,
  onCommunicationChange,
}: MemberCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const displayName = config.customName || member.name;
  const enabledSkillsCount = Object.values(config.skills).filter(
    Boolean,
  ).length;
  const enabledPluginsCount = Object.values(config.plugins).filter(
    Boolean,
  ).length;
  const configuredCommsCount = [
    config.communication.discord,
    config.communication.telegram,
    config.communication.whatsapp,
  ].filter(Boolean).length;

  return (
    <Card
      className={`transition-opacity ${config.enabled ? '' : 'opacity-50'}`}
    >
      <CardContent className="p-3 space-y-3">
        {/* Row 1: Avatar, Name, Role, Toggle */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-2xl">
            {member.identity.avatar ? (
              <img
                src={convertFileSrc(member.identity.avatar)}
                alt={member.name}
                className="h-full w-full object-cover"
              />
            ) : (
              member.identity.emoji
            )}
          </div>

          {/* Name */}
          <div className="min-w-0 flex-1">
            {isEditingName ? (
              <Input
                value={displayName}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={() => setIsEditingName(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingName(false);
                  if (e.key === 'Escape') {
                    onNameChange('');
                    setIsEditingName(false);
                  }
                }}
                className="h-7 w-32 text-sm font-medium"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => config.enabled && setIsEditingName(true)}
                className="group flex items-center gap-1 font-medium hover:text-primary"
                disabled={!config.enabled}
              >
                {displayName}
                {config.enabled && (
                  <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            )}
          </div>

          {/* Role Badge with Tooltip */}
          <div className="group relative">
            <Badge variant="outline" className="cursor-help text-xs">
              {member.role}
            </Badge>
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full right-0 mb-2 scale-95 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
              <div className="max-w-48 whitespace-normal rounded-lg bg-popover px-3 py-2 text-center text-xs shadow-lg ring-1 ring-border">
                {member.identity.theme}
              </div>
              <div className="absolute right-4 top-full border-4 border-transparent border-t-popover" />
            </div>
          </div>

          {/* Toggle */}
          <Switch
            checked={config.enabled}
            onCheckedChange={onToggle}
            aria-label={`Enable ${member.name}`}
          />
        </div>

        {/* Row 2: Accordions (only when enabled) */}
        {config.enabled && (
          <div className="space-y-1">
            {/* Skills Accordion */}
            {member.skills.length > 0 && (
              <AccordionItem
                title="Skills"
                icon={<Sparkles className="h-3.5 w-3.5" />}
                badge={`${enabledSkillsCount}/${member.skills.length}`}
                isExpanded={expandedSections.has('skills')}
                onToggle={() => toggleSection('skills')}
              >
                <div className="space-y-2">
                  {member.skills.map((skill) => (
                    <div
                      key={skill}
                      className="flex items-center justify-between"
                    >
                      <span className="text-xs">{skill}</span>
                      <Switch
                        checked={config.skills[skill] ?? true}
                        onCheckedChange={(checked) =>
                          onSkillToggle(skill, checked)
                        }
                        className="scale-75"
                      />
                    </div>
                  ))}
                </div>
              </AccordionItem>
            )}

            {/* Plugins Accordion */}
            <AccordionItem
              title="Plugins"
              icon={<Plug className="h-3.5 w-3.5" />}
              badge={`${enabledPluginsCount}/${AVAILABLE_PLUGINS.length}`}
              isExpanded={expandedSections.has('plugins')}
              onToggle={() => toggleSection('plugins')}
            >
              <div className="space-y-2">
                {AVAILABLE_PLUGINS.map((plugin) => (
                  <div
                    key={plugin.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <span className="text-xs font-medium">{plugin.name}</span>
                      <p className="text-[10px] text-muted-foreground">
                        {plugin.description}
                      </p>
                    </div>
                    <Switch
                      checked={config.plugins[plugin.id] ?? false}
                      onCheckedChange={(checked) =>
                        onPluginToggle(plugin.id, checked)
                      }
                      className="scale-75"
                    />
                  </div>
                ))}
              </div>
            </AccordionItem>

            {/* Communication Accordion */}
            <AccordionItem
              title="Communication"
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              badge={`${configuredCommsCount}/3`}
              isExpanded={expandedSections.has('communication')}
              onToggle={() => toggleSection('communication')}
            >
              <div className="space-y-3">
                {/* Discord */}
                <div className="space-y-1">
                  <Label className="text-xs">Discord Channel ID</Label>
                  <Input
                    value={config.communication.discord || ''}
                    onChange={(e) =>
                      onCommunicationChange('discord', e.target.value)
                    }
                    placeholder="e.g., 123456789012345678"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Telegram */}
                <div className="space-y-1">
                  <Label className="text-xs">Telegram Chat ID</Label>
                  <Input
                    value={config.communication.telegram || ''}
                    onChange={(e) =>
                      onCommunicationChange('telegram', e.target.value)
                    }
                    placeholder="e.g., -1001234567890"
                    className="h-8 text-xs"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1">
                  <Label className="text-xs">WhatsApp Group ID</Label>
                  <Input
                    value={config.communication.whatsapp || ''}
                    onChange={(e) =>
                      onCommunicationChange('whatsapp', e.target.value)
                    }
                    placeholder="e.g., 5511999999999-1234567890"
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </AccordionItem>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface AccordionItemProps {
  title: string;
  icon: React.ReactNode;
  badge?: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function AccordionItem({
  title,
  icon,
  badge,
  isExpanded,
  onToggle,
  children,
}: AccordionItemProps) {
  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 p-2 text-left text-xs hover:bg-muted/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        {icon}
        <span className="flex-1 font-medium">{title}</span>
        {badge && (
          <Badge variant="secondary" className="text-[10px]">
            {badge}
          </Badge>
        )}
      </button>
      {isExpanded && <div className="border-t p-2">{children}</div>}
    </div>
  );
}
