const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
    clientID: '490941061417-6i5tg0n3nskc61psdkv4pgculjedob6l.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: 'https://nivora-t9ov.onrender.com/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ email: profile.emails[0].value });
        if (!user) {
            user = await User.create({
                username: profile.emails[0].value,
                email: profile.emails[0].value,
                fullName: profile.displayName,
                password: 'google-oauth'
            });
        }
        return done(null, user);
    } catch (err) { return done(err, null); }
}));

module.exports = passport;