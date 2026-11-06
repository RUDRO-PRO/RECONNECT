const Profile = require("../models/Profile");
const Team = require("../models/Team");
const User = require("../models/User");
const {
  profileInput,
  normalizeProfile,
  teamInput,
  text,
  bad,
} = require("../validation");
const route = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
const validId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const regex = (value) =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
function installProfiles(app, auth) {
  app.get(
    "/api/projects",
    route(async (req, res) => {
      const profiles = await Profile.find({ "projects.0": { $exists: true } })
        .sort({ updatedAt: -1 })
        .lean();
      res
        .set("Cache-Control", "no-store")
        .json(
          profiles.flatMap((p) =>
            p.projects.map((project, index) => ({
              ...project,
              id: `${p._id}:${index}`,
              builder: { profileId: p._id, fullName: p.fullName },
            })),
          ),
        );
    }),
  );
  app.get(
    "/api/colleges",
    route(async (req, res) => {
      res.json(
        await Profile.aggregate([
          { $match: { "college.institution": { $type: "string", $ne: "" } } },
          { $group: { _id: "$college.institution", builders: { $sum: 1 } } },
          { $sort: { builders: -1, _id: 1 } },
        ]),
      );
    }),
  );
  app.get(
    "/api/mentors",
    route(async (req, res) =>
      res.json(
        (
          await Profile.find({ mentorshipAvailable: true })
            .sort({ updatedAt: -1 })
            .lean()
        ).map(normalizeProfile),
      ),
    ),
  );
  app.get(
    "/api/teams/saved",
    auth,
    route(async (req, res) => {
      const user = await User.findById(req.user._id)
        .select("+savedTeams")
        .lean();
      const teams = await Team.find({ _id: { $in: user.savedTeams || [] } })
        .sort({ createdAt: -1 })
        .lean();
      res.json(teams);
    }),
  );
  app.post(
    "/api/teams/:id/save",
    auth,
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid team ID.");
      if (!(await Team.exists({ _id: req.params.id })))
        fail(404, "Team not found.");
      await User.updateOne(
        { _id: req.user._id },
        { $addToSet: { savedTeams: req.params.id } },
      );
      res.json({ success: true });
    }),
  );
  app.delete(
    "/api/teams/:id/save",
    auth,
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid team ID.");
      await User.updateOne(
        { _id: req.user._id },
        { $pull: { savedTeams: req.params.id } },
      );
      res.json({ success: true });
    }),
  );
  app.get(
    "/api/profiles",
    route(async (req, res) => {
      const search = text(req.query.search, "Search", 100),
        skill = text(req.query.skill, "Skill filter", 50),
        college = text(req.query.college, "College filter", 150);
      const conditions = [];
      if (search)
        conditions.push({
          $or: [
            "fullName",
            "headline",
            "roleTag",
            "skills.name",
            "skills",
            "proofOfWork",
            "about",
            "interests",
          ].map((field) => ({ [field]: regex(search) })),
        });
      if (skill)
        conditions.push({
          $or: [{ "skills.name": regex(skill) }, { skills: regex(skill) }],
        });
      if (college) conditions.push({ "college.institution": regex(college) });
      if (req.query.available !== undefined) {
        if (!["true", "false"].includes(req.query.available))
          bad("Availability filter must be true or false.");
        const available = req.query.available === "true";
        conditions.push({
          $or: [
            { "hackathonAvailability.available": available },
            {
              hackathonAvailability: { $exists: false },
              availabilityStatus: available
                ? Profile.availability[0]
                : { $ne: Profile.availability[0] },
            },
          ],
        });
      }
      res.set("Cache-Control", "no-store");
      res.json(
        (
          await Profile.collection
            .find(conditions.length ? { $and: conditions } : {})
            .sort({ createdAt: -1 })
            .toArray()
        ).map(normalizeProfile),
      );
    }),
  );
  app.get(
    "/api/profiles/me",
    auth,
    route(async (req, res) =>
      res.json(
        normalizeProfile(
          await Profile.findOne({ userId: req.user._id }).lean(),
        ),
      ),
    ),
  );
  app.get(
    "/api/profiles/:id",
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid profile ID.");
      const profile = await Profile.findById(req.params.id).lean();
      if (!profile) fail(404, "This builder profile is no longer available.");
      res.set("Cache-Control", "no-store").json(normalizeProfile(profile));
    }),
  );
  app.post(
    "/api/profiles",
    auth,
    route(async (req, res) => {
      const profile = await Profile.findOneAndUpdate(
        { userId: req.user._id },
        { $set: profileInput(req.body) },
        { upsert: true, returnDocument: "after", runValidators: true },
      ).lean();
      await User.updateOne({ _id: req.user._id }, { $set: { avatar: profile.avatar } });
      res.json(normalizeProfile(profile));
    }),
  );
  app.put(
    "/api/profiles/:id",
    auth,
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid profile ID.");
      const profile = await Profile.findOneAndUpdate(
        { _id: req.params.id, userId: req.user._id },
        { $set: profileInput(req.body) },
        { returnDocument: "after", runValidators: true },
      ).lean();
      if (!profile) fail(404, "Owned profile not found.");
      await User.updateOne({ _id: req.user._id }, { $set: { avatar: profile.avatar } });
      res.json(normalizeProfile(profile));
    }),
  );
  app.delete(
    "/api/profiles/:id",
    auth,
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid profile ID.");
      // Closing owned recruitment listings and removing the public profile are one operation.
      await Profile.db.transaction(async (session) => {
        const profile = await Profile.findOneAndDelete(
          { _id: req.params.id, userId: req.user._id },
          { session },
        );
        if (!profile) fail(404, "Owned profile not found.");
        await Team.updateMany(
          { ownerId: req.user._id },
          { $set: { status: "closed" } },
          { session },
        );
      });
      res.json({ success: true });
    }),
  );
  app.get(
    "/api/teams",
    route(async (req, res) => {
      const search = text(req.query.search, "Team search", 100);
      const query = { status: "open" };
      if (search)
        query.$or = ["name", "event", "domains", "skillsNeeded"].map(
          (field) => ({ [field]: regex(search) }),
        );
      const teams = await Team.find(query).sort({ createdAt: -1 }).lean();
      const profiles = await Profile.find({
        userId: { $in: teams.map((t) => t.ownerId) },
      })
        .select("userId fullName")
        .lean();
      res.json(
        teams.flatMap((t) => {
          const owner = profiles.find(
            (p) => String(p.userId) === String(t.ownerId),
          );
          return owner
            ? [
                {
                  ...t,
                  owner: { profileId: owner._id, fullName: owner.fullName },
                },
              ]
            : [];
        }),
      );
    }),
  );
  app.get(
    ["/api/teams/me", "/api/teams/mine"],
    auth,
    route(async (req, res) =>
      res.json(
        await Team.find({ $or: [{ ownerId: req.user._id }, { creatorId: req.user._id }, { "members.userId": req.user._id }] })
          .sort({ createdAt: -1 })
          .lean(),
      ),
    ),
  );
  app.post(
    "/api/teams",
    auth,
    route(async (req, res) => {
      if (!(await Profile.exists({ userId: req.user._id })))
        bad("Publish your builder profile before creating a team.");
      res
        .status(201)
        .json(
          await Team.create({ ...teamInput(req.body), ownerId: req.user._id, creatorId: req.user._id, members: [{ userId: req.user._id, role: "Creator" }] }),
        );
    }),
  );
  app.put(
    "/api/teams/:id",
    auth,
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid team ID.");
      if (!(await Team.exists({ _id: req.params.id, ownerId: req.user._id })))
        fail(404, "Owned team not found.");
      if (!(await Profile.exists({ userId: req.user._id })))
        bad("Publish your profile before reopening a team.");
      const team = await Team.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.user._id },
        { $set: teamInput(req.body) },
        { returnDocument: "after", runValidators: true },
      );
      if (!team) fail(404, "Owned team not found.");
      res.json(team);
    }),
  );
  app.delete(
    "/api/teams/:id",
    auth,
    route(async (req, res) => {
      if (!validId(req.params.id)) bad("Invalid team ID.");
      const team = await Team.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.user._id,
      });
      if (!team) fail(404, "Owned team not found.");
      res.json({ success: true });
    }),
  );
}
module.exports = { installProfiles };
