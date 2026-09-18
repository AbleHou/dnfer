import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme } from 'naive-ui'

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#a8842c',
    primaryColorHover: '#c9a34a',
    primaryColorPressed: '#8a6d26',
    primaryColorSuppl: '#a8842c',
    infoColor: '#a8842c',
    successColor: '#5d8a4e',
    warningColor: '#b8860b',
    errorColor: '#c0392b',
    bodyColor: '#191310',
    cardColor: '#241c14',
    modalColor: '#241c14',
    popoverColor: '#2b2114',
    tableColor: '#241c14',
    inputColor: '#2b2114',
    inputColorDisabled: '#241c14',
    textColorBase: '#e8d9a8',
    textColor1: '#e8d9a8',
    textColor2: '#d8c896',
    textColor3: '#b09b66',
    textColorDisabled: '#8a7a5a',
    borderColor: '#6b5320',
    dividerColor: '#6b5320',
    borderRadius: '8px',
    fontFamily: '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  },
  Button: { borderRadiusMedium: '6px', fontWeight: 'bold' },
  Card: { borderRadius: '10px' },
}
export { darkTheme }
