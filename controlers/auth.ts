
const User = require("../models/User");
import jwt from "jsonwebtoken";

const register = async (req, res) => {
  try {
    const user = await User.create({ ...req.body });

    const token = user.createJWT(); // Make sure this method exists in your model

    res.status(201).json({
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone, // fixed typo
        role: user.role,
        token,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};




const login = async (req, res) =>{

    const { email, password } = req.body;

  if (!email || !password) {
    throw new BadRequestError('Please provide email and password');
  }
  const user = await User.findOne({ email });
  if (!user) {
    throw new UnauthenticatedError('Invalid Credentials');
  }
  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    throw new UnauthenticatedError('Invalid Credentials');
  }
  // compare password
  const token = user.createJWT();
  res.status(StatusCodes.OK).json({
    user: {
      email: user.email,
      lastName: user.lastName,
      location: user.location,
      name: user.name,
      token,
    },
  });

}

const updateUser = async (req, res) => {
  const { email, name, lastName, location } = req.body;
  if (!email || !name || !lastName || !location) {
    throw new BadRequest('Please provide all values');
  }
  const user = await User.findOne({ _id: req.user.userId });

  user.email = email;
  user.name = name;
  user.lastName = lastName;
  user.location = location;

  await user.save();
  const token = user.createJWT();
  res.status(StatusCodes.OK).json({
    user: {
      email: user.email,
      lastName: user.lastName,
      location: user.location,
      name: user.name,
      token,
    },
  });
};


const deleteUser = (req, res ) =>{


}

// instantiates super admin
const createSuper = async () => {
  try {
    // Check SUPERADMIN_EMAIL1 exists
    if (!process.env.SUPERADMIN_EMAIL1 || !process.env.SUPERADMIN_PASSWORD1) {
      console.warn("SUPERADMIN_EMAIL1 or PASSWORD1 not set");
      return;
    }

    // Check if Super Admin 1 exists
    const existingAdmin1 = await User.findOne({ email: process.env.SUPERADMIN_EMAIL1 });
    if (!existingAdmin1) {
      const hashed = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD1, 10);
      await User.create({
        name: "Super Admin 1",
        email: process.env.SUPERADMIN_EMAIL1,
        password: hashed,
        role: "super-admin",
      });
      console.log("✅ Super Admin 1 created");
    } else {
      console.log("Super Admin 1 already exists");
    }

    // Optional Super Admin 2
    if (process.env.SUPERADMIN_EMAIL2 && process.env.SUPERADMIN_PASSWORD2) {
      // Count current super-admins
      const superAdminCount = await User.countDocuments({ role: "super-admin" });

      if (superAdminCount < 2) {
        const existingAdmin2 = await User.findOne({ email: process.env.SUPERADMIN_EMAIL2 });
        if (!existingAdmin2) {
          const hashed2 = await bcrypt.hash(process.env.SUPERADMIN_PASSWORD2, 10);
          await User.create({
            name: "Super Admin 2",
            email: process.env.SUPERADMIN_EMAIL2,
            password: hashed2,
            role: "super-admin",
          });
          console.log(" Super Admin 2 created");
        } else {
          console.log("Super Admin 2 already exists");
        }
      } else {
        console.log(" Already 2 super-admins, skipping Super Admin 2 creation");
      }
    }
  } catch (err) {
    console.error("Error creating super admin(s):", err);
  }
};

module.exports = {
  register,
  login,
  updateUser,
  deleteUser, 
  createSuper
};
