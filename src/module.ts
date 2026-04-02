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
import { DEFAULT_TOOLTIP_CONFIG, DEFAULT_VISUAL_STYLE, SvgFlowOptions } from './types';
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
    .addBooleanSwitch({
      path: 'showSeverityLegend',
      name: t('mod.severityLegend.name'),
      description: t('mod.severityLegend.desc'),
      defaultValue: false,
      category: [t('mod.cat05')],
    })
    .addBooleanSwitch({
      path: 'showNoDataMessage',
      name: t('mod.noDataMessage.name'),
      description: t('mod.noDataMessage.desc'),
      defaultValue: false,
      category: [t('mod.cat05')],
    })
    .addBooleanSwitch({
      path: 'showLoadingIndicator',
      name: t('mod.loadingIndicator.name'),
      description: t('mod.loadingIndicator.desc'),
      defaultValue: false,
      category: [t('mod.cat05')],
    })
    .addBooleanSwitch({
      path: 'showPickModeIndicator',
      name: t('mod.pickModeIndicator.name'),
      description: t('mod.pickModeIndicator.desc'),
      defaultValue: false,
      category: [t('mod.cat05')],
    })
    // ──── 6. Advanced ────
    .addTextInput({
      path: 'autodiscoverTemplatesJson',
      name: t('mod.autodiscoverTemplates.name'),
      description: t('mod.autodiscoverTemplates.desc'),
      defaultValue: '',
      settings: {
        useTextarea: true,
        rows: 8,
      },
      category: [t('mod.cat06')],
    })
    // ──── 7. Tooltip ────
    .addSelect({
      path: 'tooltipConfig.mode',
      name: t('mod.tooltipMode.name'),
      description: t('mod.tooltipMode.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.mode,
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
      defaultValue: DEFAULT_TOOLTIP_CONFIG.maxWidth,
      settings: { min: 150, max: 800, integer: true },
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.fontSize',
      name: t('mod.tooltipFontSize.name'),
      description: t('mod.tooltipFontSize.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.fontSize,
      settings: { min: 9, max: 20, integer: true },
      category: [t('mod.cat07')],
    })
    .addTextInput({
      path: 'tooltipConfig.fontFamily',
      name: t('mod.tooltipFontFamily.name'),
      description: t('mod.tooltipFontFamily.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.fontFamily,
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipBgColor',
      path: 'tooltipConfig.backgroundColor',
      name: t('mod.tooltipBgColor.name'),
      description: t('mod.tooltipBgColor.desc'),
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_TOOLTIP_CONFIG.backgroundColor,
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipTextColor',
      path: 'tooltipConfig.textColor',
      name: t('mod.tooltipTextColor.name'),
      description: t('mod.tooltipTextColor.desc'),
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_TOOLTIP_CONFIG.textColor,
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipBorderColor',
      path: 'tooltipConfig.borderColor',
      name: t('mod.tooltipBorderColor.name'),
      description: t('mod.tooltipBorderColor.desc'),
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_TOOLTIP_CONFIG.borderColor,
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipHeaderBgColor',
      path: 'tooltipConfig.headerBackgroundColor',
      name: 'Color cabecera',
      description: 'Color de fondo de la cabecera del tooltip.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_TOOLTIP_CONFIG.headerBackgroundColor,
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.borderRadius',
      name: t('mod.tooltipBorderRadius.name'),
      description: t('mod.tooltipBorderRadius.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.borderRadius,
      settings: { min: 0, max: 20, integer: true },
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.padding',
      name: 'Padding (px)',
      description: t('mod.tooltipPadding.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.padding,
      settings: { min: 4, max: 32, integer: true },
      category: [t('mod.cat07')],
    })
    .addSliderInput({
      path: 'tooltipConfig.opacity',
      name: t('mod.tooltipOpacity.name'),
      description: t('mod.tooltipOpacity.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.opacity,
      settings: { min: 0, max: 1, step: 0.05 },
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.backdropBlur',
      name: 'Blur fondo (px)',
      description: 'Desenfoque del cristal del tooltip.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.backdropBlur,
      settings: { min: 0, max: 40, integer: true },
      category: [t('mod.cat07')],
    })
    .addCustomEditor({
      id: 'tooltipShadowColor',
      path: 'tooltipConfig.shadowColor',
      name: 'Color sombra',
      description: 'Color base de la sombra del tooltip.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_TOOLTIP_CONFIG.shadowColor,
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.shadowBlur',
      name: 'Blur sombra (px)',
      description: 'Intensidad de la sombra del tooltip.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.shadowBlur,
      settings: { min: 0, max: 80, integer: true },
      category: [t('mod.cat07')],
    })
    .addBooleanSwitch({
      path: 'tooltipConfig.showSeverity',
      name: t('mod.tooltipSeverity.name'),
      description: t('mod.tooltipSeverity.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.showSeverity,
      category: [t('mod.cat07')],
    })
    .addBooleanSwitch({
      path: 'tooltipConfig.showTimestamp',
      name: t('mod.tooltipTimestamp.name'),
      description: t('mod.tooltipTimestamp.desc'),
      defaultValue: DEFAULT_TOOLTIP_CONFIG.showTimestamp,
      category: [t('mod.cat07')],
    })
    .addBooleanSwitch({
      path: 'tooltipConfig.showMiniCharts',
      name: 'Mini graficas',
      description: 'Muestra sparklines de evolucion temporal por metrica en el tooltip.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.showMiniCharts,
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.miniChartHeight',
      name: 'Alto mini grafica (px)',
      description: 'Altura de cada sparkline dentro del tooltip.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.miniChartHeight,
      settings: { min: 16, max: 64, integer: true },
      category: [t('mod.cat07')],
    })
    .addNumberInput({
      path: 'tooltipConfig.miniChartPoints',
      name: 'Puntos mini grafica',
      description: 'Numero maximo de puntos historicos mostrados por metrica.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.miniChartPoints,
      settings: { min: 8, max: 200, integer: true },
      category: [t('mod.cat07')],
    })
    .addSelect({
      path: 'tooltipConfig.pinKey',
      name: 'Tecla fijar tooltip',
      description: 'Manteniendo esta tecla, el tooltip queda fijo para interactuar con las mini graficas.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.pinKey,
      settings: {
        options: [
          { label: 'Alt', value: 'alt' },
          { label: 'Shift', value: 'shift' },
          { label: 'Ctrl', value: 'ctrl' },
          { label: 'Meta (Windows/Cmd)', value: 'meta' },
        ],
      },
      category: [t('mod.cat07')],
    })
    .addTextInput({
      path: 'tooltipConfig.htmlTemplate',
      name: 'Plantilla HTML tooltip',
      description: 'HTML opcional con placeholders: {{hostname}}, {{severity}}, {{time}}, {{metricsHtml}}, {{severityColor}}.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.htmlTemplate,
      settings: {
        useTextarea: true,
        rows: 8,
      },
      category: [t('mod.cat07')],
    })
    .addTextInput({
      path: 'tooltipConfig.customCss',
      name: 'CSS tooltip',
      description: 'CSS avanzado. Usa :tooltip como selector raíz.',
      defaultValue: DEFAULT_TOOLTIP_CONFIG.customCss,
      settings: {
        useTextarea: true,
        rows: 8,
      },
      category: [t('mod.cat07')],
    })
    // ──── 8. Estilo ────
    .addCustomEditor({
      id: 'panelBgColor',
      path: 'visualStyle.panelBackgroundColor',
      name: 'Fondo panel',
      description: 'Color o rgba del contenedor principal.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.panelBackgroundColor,
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'panelBorderColor',
      path: 'visualStyle.panelBorderColor',
      name: 'Borde panel',
      description: 'Color del borde del contenedor.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.panelBorderColor,
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.panelBorderRadius',
      name: 'Radio panel (px)',
      description: 'Redondeo del contenedor principal.',
      defaultValue: DEFAULT_VISUAL_STYLE.panelBorderRadius,
      settings: { min: 0, max: 48, integer: true },
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.panelPadding',
      name: 'Padding panel (px)',
      description: 'Espacio interno entre el contenedor y el SVG.',
      defaultValue: DEFAULT_VISUAL_STYLE.panelPadding,
      settings: { min: 0, max: 48, integer: true },
      category: ['08. Estilo'],
    })
    .addTextInput({
      path: 'visualStyle.panelBoxShadow',
      name: 'Sombra panel',
      description: 'Valor CSS box-shadow completo.',
      defaultValue: DEFAULT_VISUAL_STYLE.panelBoxShadow,
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.panelBackdropBlur',
      name: 'Blur panel (px)',
      description: 'Desenfoque del fondo del panel.',
      defaultValue: DEFAULT_VISUAL_STYLE.panelBackdropBlur,
      settings: { min: 0, max: 40, integer: true },
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'hoverGlowColor',
      path: 'visualStyle.hoverGlowColor',
      name: 'Color glow hover',
      description: 'Color del glow al pasar el ratón.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.hoverGlowColor,
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.hoverGlowRadius',
      name: 'Radio glow hover (px)',
      description: 'Tamaño del glow al pasar el ratón.',
      defaultValue: DEFAULT_VISUAL_STYLE.hoverGlowRadius,
      settings: { min: 0, max: 40, integer: true },
      category: ['08. Estilo'],
    })
    .addSliderInput({
      path: 'visualStyle.hoverBrightness',
      name: 'Brillo hover',
      description: 'Multiplicador brightness al pasar el ratón.',
      defaultValue: DEFAULT_VISUAL_STYLE.hoverBrightness,
      settings: { min: 1, max: 2, step: 0.05 },
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'criticalGlowColor',
      path: 'visualStyle.criticalGlowColor',
      name: 'Color glow crítico',
      description: 'Color del pulso de estado crítico.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.criticalGlowColor,
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.criticalGlowMin',
      name: 'Glow crítico min (px)',
      description: 'Radio mínimo del pulso crítico.',
      defaultValue: DEFAULT_VISUAL_STYLE.criticalGlowMin,
      settings: { min: 0, max: 40, integer: true },
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.criticalGlowMax',
      name: 'Glow crítico max (px)',
      description: 'Radio máximo del pulso crítico.',
      defaultValue: DEFAULT_VISUAL_STYLE.criticalGlowMax,
      settings: { min: 0, max: 80, integer: true },
      category: ['08. Estilo'],
    })
    .addSliderInput({
      path: 'visualStyle.criticalPulseDuration',
      name: 'Duración pulso crítico (s)',
      description: 'Duración del ciclo de animación crítica.',
      defaultValue: DEFAULT_VISUAL_STYLE.criticalPulseDuration,
      settings: { min: 0.5, max: 6, step: 0.1 },
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'locateGlowColor',
      path: 'visualStyle.locateGlowColor',
      name: 'Color localizar',
      description: 'Color del efecto localizar celda.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.locateGlowColor,
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.locateGlowRadius',
      name: 'Radio localizar (px)',
      description: 'Radio máximo del glow de localizar.',
      defaultValue: DEFAULT_VISUAL_STYLE.locateGlowRadius,
      settings: { min: 0, max: 80, integer: true },
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'noDataStrokeColor',
      path: 'visualStyle.noDataStrokeColor',
      name: 'Color sin datos',
      description: 'Color del contorno de celdas sin datos.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.noDataStrokeColor,
      category: ['08. Estilo'],
    })
    .addTextInput({
      path: 'visualStyle.noDataStrokeDasharray',
      name: 'Trazo sin datos',
      description: 'Valor CSS stroke-dasharray para SIN_DATOS.',
      defaultValue: DEFAULT_VISUAL_STYLE.noDataStrokeDasharray,
      category: ['08. Estilo'],
    })
    .addSliderInput({
      path: 'visualStyle.noDataOpacity',
      name: 'Opacidad sin datos',
      description: 'Opacidad de elementos SIN_DATOS.',
      defaultValue: DEFAULT_VISUAL_STYLE.noDataOpacity,
      settings: { min: 0.1, max: 1, step: 0.05 },
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'containerColorCritical',
      path: 'visualStyle.containerColorCritical',
      name: 'Color contenedor CRITICO',
      description: 'Color de relleno para estado crítico.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.containerColorCritical,
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'containerColorMajor',
      path: 'visualStyle.containerColorMajor',
      name: 'Color contenedor MAJOR',
      description: 'Color de relleno para estado major.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.containerColorMajor,
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'containerColorMinor',
      path: 'visualStyle.containerColorMinor',
      name: 'Color contenedor MINOR',
      description: 'Color de relleno para estado minor.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.containerColorMinor,
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'containerColorWarning',
      path: 'visualStyle.containerColorWarning',
      name: 'Color contenedor WARNING',
      description: 'Color de relleno para estado warning.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.containerColorWarning,
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'containerColorNormal',
      path: 'visualStyle.containerColorNormal',
      name: 'Color contenedor NORMAL',
      description: 'Color de relleno para estado normal.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.containerColorNormal,
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'containerColorNoData',
      path: 'visualStyle.containerColorNoData',
      name: 'Color contenedor SIN_DATOS',
      description: 'Color de relleno para celdas sin datos.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.containerColorNoData,
      category: ['08. Estilo'],
    })
    .addCustomEditor({
      id: 'clickFlashColor',
      path: 'visualStyle.clickFlashColor',
      name: 'Color flash click',
      description: 'Color del flash visual al seleccionar una celda.',
      editor: ColorFieldEditor,
      defaultValue: DEFAULT_VISUAL_STYLE.clickFlashColor,
      category: ['08. Estilo'],
    })
    .addNumberInput({
      path: 'visualStyle.clickFlashDuration',
      name: 'Duración flash click (ms)',
      description: 'Tiempo del flash al clicar.',
      defaultValue: DEFAULT_VISUAL_STYLE.clickFlashDuration,
      settings: { min: 100, max: 3000, integer: true },
      category: ['08. Estilo'],
    })
    .addTextInput({
      path: 'visualStyle.customCss',
      name: 'CSS libre del panel',
      description: 'CSS avanzado. Usa :scope como selector raíz del panel.',
      defaultValue: DEFAULT_VISUAL_STYLE.customCss,
      settings: {
        useTextarea: true,
        rows: 10,
      },
      category: ['08. Estilo'],
    })
    // ──── 8. Tools ────
    .addCustomEditor({
      id: 'sidebarTools',
      path: '_sidebarTools',
      name: t('mod.sidebarTools.name'),
      description: t('mod.sidebarTools.desc'),
      editor: SidebarToolsEditor,
      defaultValue: undefined,
      category: ['09. Herramientas'],
    });
});
