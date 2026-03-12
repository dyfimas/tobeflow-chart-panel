// ─────────────────────────────────────────────────────────────
// module.ts – Entry point del plugin
// ─────────────────────────────────────────────────────────────
import { PanelPlugin } from '@grafana/data';
import { SvgFlowPanel } from './components/SvgFlowPanel';
import { CellMappingsEditor } from './components/CellMappingsEditor';
import { GlobalThresholdsEditor } from './components/GlobalThresholdsEditor';
import { DrawioEditorButton } from './components/DrawioEditorButton';
import { SvgInlineEditor } from './components/SvgInlineEditor';
import { ColorFieldEditor } from './components/ColorFieldEditor';
import { SidebarToolsEditor } from './components/SidebarToolsEditor';
import { LayersEditor } from './components/LayersEditor';
import { SvgFlowOptions } from './types';
import { t } from './i18n';

export const plugin = new PanelPlugin<SvgFlowOptions>(SvgFlowPanel).setPanelOptions((builder) => {
  builder
    // ──── 1. Source ────
    .addCustomEditor({
      id: 'svgSourceEditor',
      path: 'svgSource',
      name: t('mod.svgSource.name'),
      description: t('mod.svgSource.desc'),
      editor: SvgInlineEditor,
      defaultValue: '',
      category: [t('mod.cat01')],
    })
    .addCustomEditor({
      id: 'drawioEditor',
      path: 'svgSource',
      name: t('mod.drawio.name'),
      description: t('mod.drawio.desc'),
      editor: DrawioEditorButton,
      defaultValue: '',
      category: [t('mod.cat01')],
    })
    .addTextInput({
      path: 'svgUrl',
      name: t('mod.svgUrl.name'),
      description: t('mod.svgUrl.desc'),
      defaultValue: '',
      category: [t('mod.cat01')],
    })
    .addCustomEditor({
      id: 'layersEditor',
      path: 'layers',
      name: t('mod.layers.name'),
      description: t('mod.layers.desc'),
      editor: LayersEditor,
      defaultValue: [],
      category: [t('mod.cat01')],
    })
    // ──── 2. Data ────
    .addTextInput({
      path: 'hostField',
      name: t('mod.hostField.name'),
      description: t('mod.hostField.desc'),
      defaultValue: 'host.name',
      category: [t('mod.cat02')],
    })
    // ──── 3. Mapping ────
    .addCustomEditor({
      id: 'cellMappings',
      path: 'cellMappings',
      name: t('mod.cellMappings.name'),
      description: t('mod.cellMappings.desc'),
      editor: CellMappingsEditor,
      defaultValue: [],
      category: [t('mod.cat03')],
    })
    .addCustomEditor({
      id: 'globalThresholds',
      path: 'globalThresholds',
      name: t('mod.globalThresholds.name'),
      description: t('mod.globalThresholds.desc'),
      editor: GlobalThresholdsEditor,
      defaultValue: { mode: 'absolute', steps: [{ value: -Infinity, color: '#73BF69' }] },
      category: [t('mod.cat03')],
    })
    // ──── 4. Interaction ────
    .addTextInput({
      path: 'clickUrlTemplate',
      name: t('mod.clickUrl.name'),
      description: t('mod.clickUrl.desc'),
      defaultValue: '/d/host-detail?var-host={{host}}',
      category: [t('mod.cat04')],
    })
    // ──── 5. Diagnostics ────
    .addBooleanSwitch({
      path: 'debugMode',
      name: t('mod.debug.name'),
      description: t('mod.debug.desc'),
      defaultValue: false,
      category: [t('mod.cat05')],
    })
    // ──── 6. Advanced ────
    .addTextInput({
      path: 'hostMappingJson',
      name: 'Host Mapping (JSON)',
      description: t('mod.hostMapping.desc'),
      defaultValue: '',
      settings: {
        useTextarea: true,
        rows: 4,
        placeholder: '{"LIDO": "w12desa", "LIDO*": "w12desa"}',
      },
      category: [t('mod.cat06')],
    })
    .addTextInput({
      path: 'customThresholdsJson',
      name: 'Custom Thresholds (JSON)',
      description: t('mod.customThresholds.desc'),
      defaultValue: '',
      settings: {
        useTextarea: true,
        rows: 4,
      },
      category: [t('mod.cat06')],
    })
    .addTextInput({
      path: 'metricsConfigJson',
      name: 'Metrics Config (JSON)',
      description: t('mod.metricsConfig.desc'),
      defaultValue: '',
      settings: {
        useTextarea: true,
        rows: 6,
      },
      category: [t('mod.cat06')],
    })
    // ──── 7. Tooltip ────
    .addSelect({
      path: 'tooltipConfig.mode',
      name: t('mod.tooltipMode.name'),
      description: t('mod.tooltipMode.desc'),
      defaultValue: 'detailed',
      settings: {
        options: [
          { label: 'Detailed', value: 'detailed' },
          { label: 'Compact', value: 'compact' },
          { label: 'Off', value: 'off' },
        ],
      },
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.maxWidth',
      name: t('mod.tooltipMaxWidth.name'),
      description: t('mod.tooltipMaxWidth.desc'),
      defaultValue: 380,
      settings: { min: 150, max: 800, integer: true },
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.fontSize',
      name: t('mod.tooltipFontSize.name'),
      description: t('mod.tooltipFontSize.desc'),
      defaultValue: 12,
      settings: { min: 9, max: 20, integer: true },
      category: [t('mod.cat07')],
    })
    .addTextInput({
      path: 'tooltipConfig.fontFamily',
      name: t('mod.tooltipFontFamily.name'),
      description: t('mod.tooltipFontFamily.desc'),
      defaultValue: 'inherit',
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipBgColor',
      path: 'tooltipConfig.backgroundColor',
      name: t('mod.tooltipBgColor.name'),
      description: t('mod.tooltipBgColor.desc'),
      editor: ColorFieldEditor,
      defaultValue: 'rgba(15, 23, 42, 0.95)',
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipTextColor',
      path: 'tooltipConfig.textColor',
      name: t('mod.tooltipTextColor.name'),
      description: t('mod.tooltipTextColor.desc'),
      editor: ColorFieldEditor,
      defaultValue: '#ffffff',
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipBorderColor',
      path: 'tooltipConfig.borderColor',
      name: t('mod.tooltipBorderColor.name'),
      description: t('mod.tooltipBorderColor.desc'),
      editor: ColorFieldEditor,
      defaultValue: 'rgba(255, 255, 255, 0.1)',
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.borderRadius',
      name: t('mod.tooltipBorderRadius.name'),
      description: t('mod.tooltipBorderRadius.desc'),
      defaultValue: 4,
      settings: { min: 0, max: 20, integer: true },
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.padding',
      name: 'Padding (px)',
      description: t('mod.tooltipPadding.desc'),
      defaultValue: 12,
      settings: { min: 4, max: 32, integer: true },
      category: [t('mod.cat07')],
    })
    .addSliderInput({
      path: 'tooltipConfig.opacity',
      name: t('mod.tooltipOpacity.name'),
      description: t('mod.tooltipOpacity.desc'),
      defaultValue: 0.95,
      settings: { min: 0, max: 1, step: 0.05 },
      category: [t('mod.cat07')],
    })
    .addBooleanSwitch({
      path: 'tooltipConfig.showSeverity',
      name: t('mod.tooltipSeverity.name'),
      description: t('mod.tooltipSeverity.desc'),
      defaultValue: true,
      category: [t('mod.cat07')],
    })
    .addBooleanSwitch({
      path: 'tooltipConfig.showTimestamp',
      name: t('mod.tooltipTimestamp.name'),
      description: t('mod.tooltipTimestamp.desc'),
      defaultValue: true,
      category: [t('mod.cat07')],
    })
    // ──── 8. Tools ────
    .addCustomEditor({
      id: 'sidebarTools',
      path: '_sidebarTools',
      name: t('mod.sidebarTools.name'),
      description: t('mod.sidebarTools.desc'),
      editor: SidebarToolsEditor,
      defaultValue: undefined,
      category: [t('mod.cat08')],
    });
});
