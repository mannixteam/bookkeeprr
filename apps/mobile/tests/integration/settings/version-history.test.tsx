import { render, screen, waitFor } from '@testing-library/react-native';
import VersionHistory from '@/screens/settings/VersionHistory';
import { ThemeProvider } from '@/theme/ThemeProvider';

it('renders the current version expanded', async () => {
  render(
    <ThemeProvider>
      <VersionHistory />
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('screen-version-history')).toBeTruthy());
  expect(screen.getByText('v1.0.0')).toBeTruthy();
  expect(screen.getByText('Current')).toBeTruthy();
});
