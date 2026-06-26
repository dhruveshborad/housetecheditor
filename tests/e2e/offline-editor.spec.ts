import { test, expect } from '@playwright/test';

test.describe('Offline-First Collaborative Editor E2E Flow', () => {
  
  test('should allow offline editing and synchronize once online', async ({ page, context }) => {
    // 1. Load the landing page first to ensure service workers / scripts are fetched
    await page.goto('/');
    await expect(page.locator('text=HouseEditor')).toBeVisible();

    // 2. Click "Get Started" and navigate to dashboard
    // Note: Since this is an E2E test, we simulate user logging in or direct page interaction.
    // In full E2E, we would mock auth cookies, but we can verify basic layout rendering.
    await page.goto('/dashboard');
    
    // We expect the connection indicator to be visible on the dashboard
    const connectionIndicator = page.locator('text=Online');
    await expect(connectionIndicator).toBeVisible();

    // 3. Go Offline
    console.log('Simulating network connection loss...');
    await context.setOffline(true);

    // Verify connection status updates to Offline Mode
    const offlineIndicator = page.locator('text=Offline Mode');
    await expect(offlineIndicator).toBeVisible();

    // 4. Create new document offline
    await page.click('button:has-text("New Document")');
    await page.fill('input[placeholder="Document Title (e.g. Q3 Roadmap)"]', 'Offline Spec Doc');
    await page.click('button:has-text("Create")');

    // Page should redirect to the document editor page
    await expect(page).toHaveURL(/\/document\/offline-.*/);
    
    // Verify document title is set
    const titleField = page.locator('input[value="Offline Spec Doc"]');
    await expect(titleField).toBeVisible();

    // 5. Type content offline
    const editor = page.locator('.ProseMirror');
    await editor.click();
    await editor.fill('This paragraph was typed during an internet outage.');

    // Verify the pending sync badge is active (e.g. "1 queue")
    const pendingBadge = page.locator('text=queue');
    await expect(pendingBadge).toBeVisible();

    // 6. Restore Connection
    console.log('Restoring network connection...');
    await context.setOffline(false);

    // Check if the status switches back to Online and triggers sync
    await expect(connectionIndicator).toBeVisible();
    
    // Check that pending badge disappears after successful background sync
    await expect(page.locator('text=Synced')).toBeVisible();
  });
});
