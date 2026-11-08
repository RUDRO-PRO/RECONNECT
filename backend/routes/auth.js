const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { OAuth2Client } = require("google-auth-library");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const User = require("../models/User");
const { emailInput, passwordInput, text, bad } = require("../validation");
const configured = (value) => Boolean(value && !/your_|<|>/.test(value));
const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  avatar: u.avatar ?? u.thumbnail ?? "",
  authProvider: u.authProvider,
  isVerified: u.isVerified,
});
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
function installAuth(app, options = {}) {
  const secret = options.secret ?? process.env.JWT_SECRET;
  const clientId = require("../config").googleClientId(options.clientId);
  const googleClient = options.googleClient || new OAuth2Client(clientId || undefined);
  const smtpReady = Boolean(
    options.mailer ||
    (configured(process.env.SMTP_HOST) &&
      Boolean(
        process.env.SMTP_FROM &&
        !/your[-_]|example\./i.test(process.env.SMTP_FROM),
      ) &&
      configured(process.env.SMTP_USER) &&
      configured(process.env.SMTP_PASS)),
  );
  const mailer =
    options.mailer ||
    (smtpReady
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure:
            process.env.SMTP_SECURE === "true" ||
            process.env.SMTP_PORT === "465",
          requireTLS: true,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 15000,
          disableFileAccess: true,
          disableUrlAccess: true,
        })
      : null);
  const requireConfig = () => {
    if (!configured(secret) || secret.length < 32)
      fail(503, "Authentication is not configured.");
  };
  const issue = (user, provider) => ({
    token: jwt.sign(
      {
        userId: String(user._id),
        email: user.email,
        authProvider: provider,
        version: user.tokenVersion || 0,
      },
      secret,
      {
        subject: String(user._id),
        expiresIn: "30d",
        algorithm: "HS256",
        issuer: "reconnect",
        audience: "reconnect-web",
      },
    ),
    user: publicUser(user),
  });
  const auth = route(async (req, res, next) => {
    requireConfig();
    let payload;
    try {
      payload = jwt.verify(
        (req.headers.authorization || "").match(/^Bearer (.+)$/)?.[1],
        secret,
        {
          algorithms: ["HS256"],
          issuer: "reconnect",
          audience: "reconnect-web",
        },
      );
      if (!/^[a-f\d]{24}$/i.test(payload.sub) || payload.userId !== payload.sub)
        throw new Error();
    } catch {
      fail(401, "Please sign in to continue.");
    }
    req.user = await User.findById(payload.sub).select("name email thumbnail authProvider isVerified tokenVersion").lean();
    if (req.user && (req.user.isVerified === undefined || req.user.authProvider === "google")) req.user.isVerified = true;
    if (!req.user || (req.user.tokenVersion || 0) !== payload.version)
      fail(401, "Your session has expired. Please sign in again.");
    if (req.user.isVerified === false) fail(403, "Verify your email before continuing.");
    next();
  });
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    skip: req => req.method === "GET",
    keyGenerator: req => {
      const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return `${ipKeyGenerator(req.ip)}:${crypto.createHash('sha256').update(email).digest('hex').slice(0, 16)}`;
    },
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
      message: "Too many authentication attempts. Please try again later.",
    },
  });
  app.use("/api/auth", limiter);
  const otpHash = otp => crypto.createHash("sha256").update(otp).digest("hex");
  async function sendVerification(user, strict = false) {
    if (!smtpReady) fail(503, "Verification email is not configured. Please try again later.");
    const now = new Date(), otp = String(crypto.randomInt(100000, 999999)), hash = otpHash(otp);
    const reserved = await User.findOneAndUpdate({ _id: user._id, isVerified: false,
      $or: [{ verificationOtpSentAt: { $lte: new Date(now - 45000) } }, { verificationOtpSentAt: { $exists: false } }] },
      { $set: { verificationOtpHash: hash, verificationOtpExpires: new Date(+now + 600000), verificationOtpSentAt: now, verificationOtpAttempts: 0 } });
    if (!reserved) { if (strict) fail(429, "Please wait 45 seconds before requesting another code."); return; }
    try {
      const sent = await mailer.sendMail({ from: process.env.SMTP_FROM || "Reconnect <noreply@example.test>", to: user.email,
        subject: "Verify your Reconnect email", text: `Your Reconnect verification code is ${otp}. It expires in 10 minutes.` });
      if (sent.rejected?.length) throw new Error("Mail rejected");
    } catch {
      await User.updateOne({ _id: user._id, verificationOtpHash: hash }, { $unset: { verificationOtpHash: 1, verificationOtpExpires: 1, verificationOtpSentAt: 1 } });
      fail(503, "Verification email could not be delivered. Please try again.");
    }
  }
  app.post("/api/auth/register", route(async (req, res) => {
    requireConfig();
    const email = emailInput(req.body.email), name = text(req.body.fullName, "Full name", 100, true), password = passwordInput(req.body.password);
    await require("../utils/emailValidator").validateEmailDomain(email, options.resolveMx);
    if (!smtpReady) fail(503, "Verification email is not configured. Please try again later.");
    let user = await User.findOne({ email }).select("+password");
    if (user && user.isVerified !== false) fail(409, "An account with this email already exists. Sign in or reset your password.");
    if (user && !await bcrypt.compare(password, user.password || "")) fail(409, "Registration is pending. Sign in with the original password or reset it first.");
    // Preserve the original credentials on retries; an attacker must not replace them.
    if (!user) user = await User.create({ email, name, password: await bcrypt.hash(password, 12), authProvider: "local", isVerified: false });
    await sendVerification(user);
    res.status(201).json({ code: "EMAIL_NOT_VERIFIED", email, message: "Check your email for a six-digit verification code.", retryAfter: 45 });
  }));
  app.post("/api/auth/resend-verification", route(async (req, res) => {
    requireConfig(); const email = emailInput(req.body.email);
    const user = await User.findOne({ email, isVerified: false });
    if (!user) fail(400, "No pending verification found. Sign in or register first.");
    await sendVerification(user, true);
    res.json({ message: "A fresh verification code has been sent.", retryAfter: 45 });
  }));
  app.post("/api/auth/verify-email", route(async (req, res) => {
    requireConfig(); const email = emailInput(req.body.email), otp = req.body.otp;
    if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) bad("Enter the six-digit code from your email.");
    const user = await User.findOneAndUpdate({ email, isVerified: false, verificationOtpExpires: { $gt: new Date() }, verificationOtpAttempts: { $lt: 5 } },
      { $inc: { verificationOtpAttempts: 1 } }, { returnDocument: "after" }).select("+verificationOtpHash");
    const hash = otpHash(otp);
    if (!user?.verificationOtpHash || !crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.verificationOtpHash, "hex"))) fail(400, "Code is invalid, expired, or has too many attempts. Request a new code.");
    const verified = await User.findOneAndUpdate({ _id: user._id, isVerified: false, verificationOtpHash: hash, verificationOtpExpires: { $gt: new Date() } },
      { $set: { isVerified: true }, $unset: { verificationOtpHash: 1, verificationOtpExpires: 1, verificationOtpSentAt: 1, verificationOtpAttempts: 1 } }, { returnDocument: "after" });
    if (!verified) fail(400, "This code has already been used or expired.");
    res.json(issue(verified, "local"));
  }));
  // A fixed bcrypt hash keeps unknown-account login comparisons on the same work path.
  const dummyHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7kT5W3GxFP3EoMXIQh6pE9JQ8B7KxQe";
  app.post(
    "/api/auth/login",
    route(async (req, res) => {
      requireConfig();
      const email = emailInput(req.body.email);
      const password = passwordInput(req.body.password);
      const user = await User.findOne({ email }).select("+password");
      const matches = await bcrypt.compare(
        password,
        user?.password || dummyHash,
      );
      if (!user?.password || !matches)
        fail(401, "Email or password is incorrect.");
      if (user.isVerified === false) {
        await sendVerification(user);
        return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", email, message: "Verify your email to sign in.", retryAfter: 45 });
      }
      res.json(issue(user, "local"));
    }),
  );
  app.post(
    "/api/auth/google",
    route(async (req, res) => {
      requireConfig();
      if (!clientId) fail(503, "Google sign-in is not configured.");
      if (typeof req.body.credential !== "string" || !req.body.credential)
        bad("A Google ID token is required.");
      let p;
      try {
        p = (
          await googleClient.verifyIdToken({
            idToken: req.body.credential,
            audience: clientId,
          })
        ).getPayload();
        if (!p?.sub || !p.email || !p.email_verified) throw new Error();
      } catch {
        fail(401, "Google could not verify your identity.");
      }
      const email = emailInput(p.email);
      let user = await User.findOne({ googleId: p.sub });
      // Never merge an unverified local account merely because its email matches Google.
      if (!user && (await User.exists({ email })))
        fail(
          409,
          "This email already has an account. Use email sign-in or reset its password.",
        );
      user = await User.findOneAndUpdate(
        { googleId: p.sub },
        {
          $set: {
            email,
            name: p.name || email,
            avatar: p.picture || "",
            thumbnail: p.picture || "",
            authProvider: "google",
            isVerified: true,
          },
        },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
      res.json(issue(user, "google"));
    }),
  );
  const resetMessage =
    "If an account exists, a reset code has been sent. Check your inbox and spam folder.";
  const digest = (email, otp) =>
    crypto.createHmac("sha256", secret).update(`${email}:${otp}`).digest("hex");
  app.post(
    "/api/auth/forgot-password",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 10,
      message: { message: "Too many reset requests. Try again later." },
    }),
    route(async (req, res) => {
      requireConfig();
      const email = emailInput(req.body.email);
      if (!smtpReady) fail(503, "Password reset email is not configured.");
      const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
      const hash = digest(email, otp);
      const now = new Date();
      const user = await User.findOneAndUpdate(
        {
          email,
          $or: [
            { resetOtpSentAt: { $lt: new Date(now.getTime() - 60000) } },
            { resetOtpSentAt: { $exists: false } },
          ],
        },
        {
          $set: {
            resetOtp: hash,
            resetOtpExpires: new Date(now.getTime() + 10 * 60000),
            resetOtpAttempts: 0,
            resetOtpSentAt: now,
          },
        },
        { returnDocument: "after" },
      );
      if (user) {
        try {
          const sent = await mailer.sendMail({
            from: process.env.SMTP_FROM || "Reconnect <noreply@example.test>",
            to: email,
            subject: "Your Reconnect password reset code",
            text: `Your Reconnect reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`,
          });
          if (sent.rejected?.length) throw new Error("Mail rejected");
        } catch {
          await User.updateOne(
            { _id: user._id, resetOtp: hash },
            {
              $unset: { resetOtp: 1, resetOtpExpires: 1, resetOtpSentAt: 1 },
              $set: { resetOtpAttempts: 0 },
            },
          );
          // Never log reset codes or account addresses.
          console.error(
            "Password reset email delivery failed. Check SMTP configuration.",
          );
          fail(
            503,
            "Password reset email could not be delivered. Please try again later.",
          );
        }
      }
      res.json({ message: resetMessage });
    }),
  );
  const reset = route(async (req, res) => {
    requireConfig();
    const email = emailInput(req.body.email);
    const password = passwordInput(req.body.password ?? req.body.newPassword);
    const otp = req.body.otp;
    if (typeof otp !== "string" || !/^\d{6}$/.test(otp))
      bad("Enter the six-digit code from your email.");
    // Reserve an attempt atomically so parallel guesses cannot bypass the cap.
    const user = await User.findOneAndUpdate(
      {
        email,
        resetOtp: { $exists: true },
        resetOtpExpires: { $gt: new Date() },
        resetOtpAttempts: { $lt: 5 },
      },
      { $inc: { resetOtpAttempts: 1 } },
      { returnDocument: "after" },
    ).select("+resetOtp +resetOtpExpires");
    const hash = digest(email, otp);
    if (
      !user ||
      !user.resetOtp ||
      !crypto.timingSafeEqual(
        Buffer.from(user.resetOtp, "hex"),
        Buffer.from(hash, "hex"),
      )
    )
      fail(
        400,
        "Code is invalid, expired, or has too many attempts. Request a new code.",
      );
    const updated = await User.findOneAndUpdate(
      { _id: user._id, resetOtp: hash, resetOtpExpires: { $gt: new Date() } },
      {
        $set: { password: await bcrypt.hash(password, 12) },
        $unset: { resetOtp: 1, resetOtpExpires: 1, resetOtpSentAt: 1 },
        $inc: { tokenVersion: 1 },
      },
      { returnDocument: "after" },
    );
    if (!updated)
      fail(400, "This reset code has already been used or expired.");
    res.json({ message: "Password updated. Sign in with your new password." });
  });
  app.post("/api/auth/reset-password", reset);
  app.post("/api/auth/verify-otp-reset", reset);
  app.get("/api/auth/me", auth, (req, res) => res.json(publicUser(req.user)));
  app.post(
    "/api/auth/logout",
    auth,
    route(async (req, res) => {
      await User.updateOne(
        { _id: req.user._id },
        { $inc: { tokenVersion: 1 } },
      );
      res.json({ success: true });
    }),
  );
  return { auth };
}
module.exports = { installAuth, publicUser };
