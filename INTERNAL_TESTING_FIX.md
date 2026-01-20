# Fix: Internal Testing Opt-In URL Not Working

## The Problem

Users are getting the error:
> "App not available - your account hasn't yet been invited to participate in this app's internal testing program"

**Root Cause:** In Internal Testing, users **MUST be pre-added to an email list first** before the opt-in URL will work. The opt-in URL is just a convenient way for users who are already in your email list to join - it does **NOT** auto-add users to the list.

**Key Point:** Internal Testing opt-in URLs are **NOT public links**. They only work for users who are already in your selected email list (pre-added by you).

## The Solution: Select an Email List

### Step 1: Go to Testers Section

1. Go to [Google Play Console](https://play.google.com/console/)
2. Select **MeepleUp**
3. Navigate to **Testing** → **Internal testing**
4. Click on the **Testers** tab (or scroll to Testers section)

### Step 2: Select an Email List

You should see **"How testers join your test"** with two sections:

1. **Email addresses** - Shows your email lists (but they're not selected!)
2. **Opt-in URL** - Shows your opt-in URL

**To fix it:**

1. Look at the **Email addresses** section
2. You should see checkboxes or radio buttons next to your email lists
3. **Check/select at least ONE email list** (you can select multiple)
4. Click **Save** or **Save changes**

### Step 3: Create an Email List (If Needed)

If you don't have any email lists yet, or want to create a public one:

**Option A: Create a Simple Email List**

1. In the **Email addresses** section, click **Create email list**
2. Give it a name (e.g., "Public Beta Testers")
3. You can either:
   - Add emails manually (one per line, up to 100 total for Internal Testing)
   - Or leave it empty - users will be added automatically when they use the opt-in URL
4. **Important:** Select/check this email list after creating it
5. Click **Save**

**Option B: Use a Google Group (Recommended for Public Access)**

If you want truly public access (anyone can join without you adding them manually):

1. Create a **public Google Group**:
   - Go to https://groups.google.com/
   - Click **Create Group**
   - Name it (e.g., "MeepleUp Beta Testers")
   - Set it to **Public** (anyone on the web can join)
   - Save

2. Add the Google Group email to your Internal Testing:
   - In Play Console → **Testing** → **Internal testing** → **Testers**
   - Under **Email addresses**, click **Add email list** or **Create email list**
   - Enter your Google Group email (e.g., `meepleup-beta-testers@googlegroups.com`)
   - **Check/select this email list**
   - Save

3. Users can now:
   - Join the Google Group themselves (public group)
   - Since the Google Group email is in your Internal Testing list, they can use the opt-in URL to join Internal Testing
   
**Note:** With Internal Testing, the opt-in URL only works for users whose emails are already in your selected email list. The URL does NOT auto-add users - they must be pre-added.

### Step 4: Verify It Works

1. **Make sure at least one email list is checked/selected** ✅
2. **Save changes**
3. Test the opt-in URL in an incognito window with a different Google account
4. You should now be able to join without the error!

## Why This Happens

Internal Testing is designed for **internal team testing** (hence the name), so it requires email whitelisting as a security feature since it bypasses Google's review process. Users **MUST be pre-added to an email list** before the opt-in URL will work for them.

**Key Points:**
- Internal Testing opt-in URLs are **NOT public links**
- Users must be **pre-added to your email list** first (up to 100 total)
- The opt-in URL is just a convenient way for **already-invited users** to join
- This is a security feature - Internal Testing bypasses Google's review process

## Quick Checklist

- [ ] Go to **Testing** → **Internal testing** → **Testers**
- [ ] Check **Email addresses** section
- [ ] **Select/check at least one email list** (or create one)
- [ ] **Save changes**
- [ ] Test opt-in URL in incognito mode
- [ ] Users should now be able to join!

## Alternative: Use Closed Testing ⭐ RECOMMENDED FOR PUBLIC LINKS

If you want a **truly public opt-in link** (no email collection, no pre-adding required), you **MUST use Closed Testing**, not Internal Testing:

**Closed Testing:**
- ✅ Unlimited testers
- ✅ **Truly public opt-in URL** - anyone can use it without being pre-added
- ✅ No email list management needed
- ⚠️ Takes longer to review/approve than Internal Testing (automated policy checks, not full manual review)
- ⚠️ Light automated policy checks (still faster than production review)

**Internal Testing vs Closed Testing:**
- **Internal Testing:** For internal team testing (100 tester limit, email whitelist required)
- **Closed Testing:** For public beta testing (unlimited testers, public opt-in URL)

**For your use case (public link on meepleup.com):** You should switch to **Closed Testing**.

See `CLOSED_TESTING_SETUP.md` for step-by-step instructions to migrate.

---

**The fix is simple:** Just select/check at least one email list in the Testers section, and your opt-in URL will start working!

