// Help & support.
import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../src/lib/config';
import { Screen, Menu, MenuItem, T } from '../src/ui/kit';

export default function Help() {
  return <Screen>
    <Menu>
      <MenuItem icon="doc" title="How-to guides" sub="Opens the help page" onPress={() => WebBrowser.openBrowserAsync(`${config.officeUrl}/help`)} />
      <MenuItem icon="chat" title="Email support" sub="We answer fast" onPress={() => Linking.openURL('mailto:support@cydras.app?subject=Help%20with%20Cydras')} last />
    </Menu>
    <T s size={14}>Tip: your work saves on the phone even with no signal. Look for the orange "No signal" bar.</T>
  </Screen>;
}
