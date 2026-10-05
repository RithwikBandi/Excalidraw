import { expect, test } from "@playwright/test";

import { register, uniqueUser } from "./helpers";

// 1x1 PNG: small, but a real image the browser can decode and re-encode
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("auth page: password is hidden, can be revealed, and errors are inline", async ({
  page,
}) => {
  await page.goto("/register");
  const pw = page.getByLabel("Password", { exact: true });
  await expect(pw).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(pw).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(pw).toHaveAttribute("type", "password");

  // empty submit: friendly inline errors, no browser bubbles
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Tell us what to call you.")).toBeVisible();
  await expect(page.getByText("Enter your email address.")).toBeVisible();

  // weak password: live strength feedback, then a clear rule on submit
  await page.getByLabel("Display name", { exact: true }).fill("Weak Tester");
  await page.getByLabel("Email", { exact: true }).fill(uniqueUser().email);
  await pw.fill("short");
  await expect(page.getByText("Password strength: Too short")).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();

  // wrong credentials on the login page stay on the page with an alert
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("nobody@e2e.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Wrong email or password.",
  );
  await expect(page).toHaveURL(/\/login/);
});

test("password change is hidden behind a button and works end to end", async ({
  page,
}) => {
  const user = await register(page);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Security" }).click();

  // nothing sensitive is on screen until the user asks for it
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  await page.getByRole("button", { name: "Change password" }).click();
  const dialog = page.getByRole("dialog", { name: "Change password" });
  const cur = dialog.getByLabel("Current password", { exact: true });
  const next = dialog.getByLabel("New password", { exact: true });
  const again = dialog.getByLabel("Confirm new password", { exact: true });
  await expect(cur).toHaveAttribute("type", "password");

  const newPassword = "a-brand-new-passphrase-42";
  await cur.fill(user.password);
  await next.fill(newPassword);
  await again.fill("something-else-entirely-1");
  await dialog.getByRole("button", { name: "Update password" }).click();
  await expect(dialog.getByText(/passwords don.t match/)).toBeVisible();

  await again.fill(newPassword);
  await cur.fill("definitely-the-wrong-one");
  await dialog.getByRole("button", { name: "Update password" }).click();
  await expect(dialog.getByText(/isn.t your current password/)).toBeVisible();

  await cur.fill(user.password);
  await dialog.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // the new password really is the one that works now
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/login/);
  // the old password is refused ...
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Wrong email or password.",
  );
  // ... and the new one signs in (the app returns you to where you were)
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("link", { name: "Edit your profile" }),
  ).toBeVisible();
});

test("profile: rename inline, then upload, crop and remove a photo", async ({
  page,
}) => {
  await register(page);
  await page.getByRole("link", { name: "Settings" }).click();

  // inline rename
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Display name").fill("Renamed Person");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Display name updated.")).toBeVisible();
  await expect(page.locator(".profile-hero h3")).toHaveText("Renamed Person");

  // photo upload -> crop dialog -> saved
  await page.locator('input[type="file"]').setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  const dialog = page.getByRole("dialog", { name: "Adjust photo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Profile photo updated.")).toBeVisible();

  // it is served by our own avatar route and actually loads
  const sidebarImg = page.locator(".user-box img");
  await expect(sidebarImg).toHaveAttribute(
    "src",
    /\/api\/v1\/avatars\/[a-f0-9]{24}\?v=\d+/,
  );
  await expect
    .poll(() =>
      sidebarImg.evaluate(
        (el) =>
          (el as HTMLImageElement).complete &&
          (el as HTMLImageElement).naturalWidth > 0,
      ),
    )
    .toBe(true);

  // removal goes through the app's own confirm dialog
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Remove profile photo?" })
    .getByRole("button", { name: "Remove photo" })
    .click();
  await expect(page.getByText("Profile photo removed.")).toBeVisible();
  await expect(page.locator(".user-box img")).toHaveCount(0);
});

test("dropdowns are custom (no native <select>) and fully keyboard-usable", async ({
  page,
}) => {
  await register(page);
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Members" }).click();
  await expect(page.locator("select")).toHaveCount(0);

  const role = page.getByRole("combobox", { name: "Role for the new member" });
  await expect(role).toHaveAttribute("data-value", "MEMBER");
  await role.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(role).toHaveAttribute("data-value", "ADMIN");
  await expect(page.getByRole("listbox")).toHaveCount(0);

  // Escape closes the menu without changing the value; outside click closes too
  await role.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(role).toHaveAttribute("data-value", "ADMIN");
  await role.click();
  await page.getByRole("heading", { name: "Members" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("only owners/admins can add members: hidden for members, refused by the server", async ({
  page,
  browser,
}) => {
  const owner = await register(page);
  const ownerWs = `${owner.displayName}'s workspace`;

  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  const bobUser = uniqueUser("bob");
  await register(bob, bobUser);

  // the owner adds Bob (an existing account) as a plain member
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("tab", { name: "Members" }).click();
  await page.getByPlaceholder("Add member by email").fill(bobUser.email);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(bobUser.email)).toBeVisible();

  // Bob switches to the owner's workspace through the custom workspace menu
  // (reload first: his workspace list was loaded before he was added)
  await bob.reload();
  await bob.getByRole("button", { name: /^Workspace:/ }).click();
  await bob.getByRole("menuitemradio", { name: new RegExp(ownerWs) }).click();
  await bob.getByRole("link", { name: "Settings" }).click();
  await bob.getByRole("tab", { name: "Members" }).click();

  // UI: no add form, a clear explanation, no admin-only tabs
  await expect(bob.getByPlaceholder("Add member by email")).toHaveCount(0);
  await expect(
    bob.getByText("Only owners and admins can add or remove people."),
  ).toBeVisible();
  await expect(bob.getByRole("tab", { name: "API keys" })).toHaveCount(0);
  await expect(bob.getByRole("tab", { name: "Audit log" })).toHaveCount(0);

  // Server: hiding the form is not the security boundary; the API refuses too
  const wsId = bob.url().match(/\/w\/([a-f0-9]{24})/)![1];
  const res = await bob.request.post(`/api/v1/workspaces/${wsId}/members`, {
    data: { email: owner.email, role: "MEMBER" },
    headers: { "x-requested-with": "excalidraw-workspace" },
  });
  expect(res.status()).toBe(403);

  // Owner removes Bob through the app's own confirm dialog
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page
    .getByRole("dialog", { name: /^Remove / })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(page.getByText(bobUser.email)).toHaveCount(0);

  await bobCtx.close();
});
