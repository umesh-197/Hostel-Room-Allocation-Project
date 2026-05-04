<<<<<<< HEAD
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* ================= DB CONNECT ================= */
mongoose.connect("mongodb://127.0.0.1:27017/hostelDB")
    .then(() => console.log("MongoDB Connected ✅"))
    .catch(err => console.log(err));


/* ================= MODELS ================= */

// USER
const User = mongoose.model("User", new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    bedNumber: Number
}));

// ROOM
const Room = mongoose.model("Room", new mongoose.Schema({
    roomNumber: Number,
    floor: Number,
    type: String,
    price: Number,
    isAC: Boolean,
    beds: [
        {
            bedNumber: Number,
            isBooked: { type: Boolean, default: false }
        }
    ]
}));

// BOOKING
const Booking = mongoose.model("Booking", new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    bedNumber: Number,

    checkIn: Date,
    checkOut: Date,

    totalAmount: Number,

    paymentStatus: {
        type: String,
        enum: ["pending", "paid"],
        default: "pending"
    },

    status: {
        type: String,
        enum: ["active", "completed"],
        default: "active"
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
}));

// PAYMENT
const Payment = mongoose.model("Payment", new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    bookingId: mongoose.Schema.Types.ObjectId,

    amount: Number,

    status: {
        type: String,
        enum: ["pending", "paid"],
        default: "paid"
    },

    paymentMethod: {
        type: String,
        default: "offline"
    },

    paidAt: Date
}));


/* ================= HELPERS ================= */

function getPrice(type, floor) {
    const isAC = floor >= 6;

    if (type === "4-sharing") return isAC ? 10000 : 8500;
    if (type === "3-sharing") return isAC ? 11500 : 9500;
    if (type === "2-sharing") return isAC ? 13000 : 10000;
}

function createBeds(count) {
    let beds = [];
    for (let i = 1; i <= count; i++) {
        beds.push({ bedNumber: i });
    }
    return beds;
}


/* ================= AUTH ================= */

// REGISTER
app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existing = await User.findOne({ email });
        if (existing) {
            return res.json({ msg: "Email already exists ❌" });
        }

        const hash = await bcrypt.hash(password, 10);

        const user = new User({ name, email, password: hash });
        await user.save();

        res.json({ msg: "Registered ✅" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.json({ msg: "User not found ❌" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ msg: "Wrong password ❌" });

    res.json({ msg: "Login success ✅", userId: user._id });
});


/* ================= ROOM SEED (RUN ONCE) ================= */

app.get("/api/seed", async (req, res) => {
    await Room.deleteMany();

    let rooms = [];

    for (let floor = 1; floor <= 7; floor++) {

        // 4-sharing (4 rooms)
        for (let i = 1; i <= 4; i++) {
            rooms.push({
                roomNumber: floor * 100 + i,
                floor,
                type: "4-sharing",
                price: getPrice("4-sharing", floor),
                isAC: floor >= 6,
                beds: createBeds(4)
            });
        }

        // 3-sharing (2 rooms)
        for (let i = 5; i <= 6; i++) {
            rooms.push({
                roomNumber: floor * 100 + i,
                floor,
                type: "3-sharing",
                price: getPrice("3-sharing", floor),
                isAC: floor >= 6,
                beds: createBeds(3)
            });
        }

        // 2-sharing (2 rooms)
        for (let i = 7; i <= 8; i++) {
            rooms.push({
                roomNumber: floor * 100 + i,
                floor,
                type: "2-sharing",
                price: getPrice("2-sharing", floor),
                isAC: floor >= 6,
                beds: createBeds(2)
            });
        }
    }

    await Room.insertMany(rooms);

    res.json({ msg: "Rooms seeded successfully 🚀" });
});


/* ================= ROOMS ================= */

// ALL ROOMS
app.get("/api/rooms", async (req, res) => {
    const rooms = await Room.find();
    res.json(rooms);
});

// AVAILABLE ROOMS
app.get("/api/rooms/available", async (req, res) => {
    const rooms = await Room.find();

    const availableRooms = rooms
        .map(room => {
            const availableBeds = room.beds.filter(b => !b.isBooked).length;
            return { ...room._doc, availableBeds };
        })
        .filter(room => room.availableBeds > 0); // 🔥 filter full rooms

    res.json(availableRooms);
});

// FILTER ROOMS
app.get("/api/rooms/filter", async (req, res) => {
    const { floor, isAC, type } = req.query;

    let query = {};
    if (floor) query.floor = Number(floor);
    if (isAC !== undefined) query.isAC = isAC === "true";
    if (type) query.type = type;

    const rooms = await Room.find(query);
    res.json(rooms);
});


/* ================= BOOKING ================= */

// BOOK BED (SAFE)
app.post("/api/book", async (req, res) => {
    try {
        const { roomId, bedNumber, userId, checkIn, checkOut } = req.body;

        const room = await Room.findOneAndUpdate(
            {
                _id: roomId,
                "beds.bedNumber": bedNumber,
                "beds.isBooked": false
            },
            {
                $set: { "beds.$.isBooked": true }
            },
            { new: true }
        );

        if (!room) {
            return res.json({ msg: "Bed already booked ❌" });
        }

        const days = Math.ceil(
            (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
        );

        const totalAmount = days * room.price;

        await User.findByIdAndUpdate(userId, {
            roomId,
            bedNumber
        });

        const booking = new Booking({
            userId,
            roomId,
            bedNumber,
            checkIn,
            checkOut,
            totalAmount
        });

        await booking.save();

        res.json({ msg: "Booking successful ✅", totalAmount });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// MY BOOKING
app.get("/api/my-booking/:userId", async (req, res) => {
    const booking = await Booking.findOne({ userId: req.params.userId })
        .populate("roomId");

    res.json(booking);
});


/* ================= CHECKOUT ================= */

app.post("/api/checkout", async (req, res) => {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.json({ msg: "Booking not found ❌" });

    await Room.updateOne(
        { _id: booking.roomId, "beds.bedNumber": booking.bedNumber },
        { $set: { "beds.$.isBooked": false } }
    );

    booking.status = "completed";
    await booking.save();

    res.json({ msg: "Checked out successfully ✅" });
});


/* ================= PAYMENT ================= */

app.post("/api/payment", async (req, res) => {
    const { userId, bookingId, amount, method } = req.body;

    const payment = new Payment({
        userId,
        bookingId,
        amount,
        paymentMethod: method,
        status: "paid",
        paidAt: new Date()
    });

    await payment.save();

    await Booking.findByIdAndUpdate(bookingId, { paymentStatus: "paid" });

    res.json({ msg: "Payment successful 💰" });
});

app.get("/api/payment/:userId", async (req, res) => {
    const payments = await Payment.find({ userId: req.params.userId });
    res.json(payments);
});


/* ================= ADMIN STATS ================= */

app.get("/api/stats", async (req, res) => {
    const totalRooms = await Room.countDocuments();
    const totalUsers = await User.countDocuments();
    const activeBookings = await Booking.countDocuments({ status: "active" });

    res.json({
        totalRooms,
        totalUsers,
        activeBookings
    });
});


/* ================= SERVER ================= */

app.listen(5000, () => {
    console.log("Server running on port 5000 🚀");
=======
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* ================= DB CONNECT ================= */
mongoose.connect("mongodb://127.0.0.1:27017/hostelDB")
    .then(() => console.log("MongoDB Connected ✅"))
    .catch(err => console.log(err));


/* ================= MODELS ================= */

// USER
const User = mongoose.model("User", new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    bedNumber: Number
}));

// ROOM
const Room = mongoose.model("Room", new mongoose.Schema({
    roomNumber: Number,
    floor: Number,
    type: String,
    price: Number,
    isAC: Boolean,
    beds: [
        {
            bedNumber: Number,
            isBooked: { type: Boolean, default: false }
        }
    ]
}));

// BOOKING
const Booking = mongoose.model("Booking", new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
    bedNumber: Number,

    checkIn: Date,
    checkOut: Date,

    totalAmount: Number,

    paymentStatus: {
        type: String,
        enum: ["pending", "paid"],
        default: "pending"
    },

    status: {
        type: String,
        enum: ["active", "completed"],
        default: "active"
    },

    createdAt: {
        type: Date,
        default: Date.now
    }
}));

// PAYMENT
const Payment = mongoose.model("Payment", new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    bookingId: mongoose.Schema.Types.ObjectId,

    amount: Number,

    status: {
        type: String,
        enum: ["pending", "paid"],
        default: "paid"
    },

    paymentMethod: {
        type: String,
        default: "offline"
    },

    paidAt: Date
}));


/* ================= HELPERS ================= */

function getPrice(type, floor) {
    const isAC = floor >= 6;

    if (type === "4-sharing") return isAC ? 10000 : 8500;
    if (type === "3-sharing") return isAC ? 11500 : 9500;
    if (type === "2-sharing") return isAC ? 13000 : 10000;
}

function createBeds(count) {
    let beds = [];
    for (let i = 1; i <= count; i++) {
        beds.push({ bedNumber: i });
    }
    return beds;
}


/* ================= AUTH ================= */

// REGISTER
app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const existing = await User.findOne({ email });
        if (existing) {
            return res.json({ msg: "Email already exists ❌" });
        }

        const hash = await bcrypt.hash(password, 10);

        const user = new User({ name, email, password: hash });
        await user.save();

        res.json({ msg: "Registered ✅" });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// LOGIN
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.json({ msg: "User not found ❌" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.json({ msg: "Wrong password ❌" });

    res.json({ msg: "Login success ✅", userId: user._id });
});


/* ================= ROOM SEED (RUN ONCE) ================= */

app.get("/api/seed", async (req, res) => {
    await Room.deleteMany();

    let rooms = [];

    for (let floor = 1; floor <= 7; floor++) {

        // 4-sharing (4 rooms)
        for (let i = 1; i <= 4; i++) {
            rooms.push({
                roomNumber: floor * 100 + i,
                floor,
                type: "4-sharing",
                price: getPrice("4-sharing", floor),
                isAC: floor >= 6,
                beds: createBeds(4)
            });
        }

        // 3-sharing (2 rooms)
        for (let i = 5; i <= 6; i++) {
            rooms.push({
                roomNumber: floor * 100 + i,
                floor,
                type: "3-sharing",
                price: getPrice("3-sharing", floor),
                isAC: floor >= 6,
                beds: createBeds(3)
            });
        }

        // 2-sharing (2 rooms)
        for (let i = 7; i <= 8; i++) {
            rooms.push({
                roomNumber: floor * 100 + i,
                floor,
                type: "2-sharing",
                price: getPrice("2-sharing", floor),
                isAC: floor >= 6,
                beds: createBeds(2)
            });
        }
    }

    await Room.insertMany(rooms);

    res.json({ msg: "Rooms seeded successfully 🚀" });
});


/* ================= ROOMS ================= */

// ALL ROOMS
app.get("/api/rooms", async (req, res) => {
    const rooms = await Room.find();
    res.json(rooms);
});

// AVAILABLE ROOMS
app.get("/api/rooms/available", async (req, res) => {
    const rooms = await Room.find();

    const availableRooms = rooms
        .map(room => {
            const availableBeds = room.beds.filter(b => !b.isBooked).length;
            return { ...room._doc, availableBeds };
        })
        .filter(room => room.availableBeds > 0); // 🔥 filter full rooms

    res.json(availableRooms);
});

// FILTER ROOMS
app.get("/api/rooms/filter", async (req, res) => {
    const { floor, isAC, type } = req.query;

    let query = {};
    if (floor) query.floor = Number(floor);
    if (isAC !== undefined) query.isAC = isAC === "true";
    if (type) query.type = type;

    const rooms = await Room.find(query);
    res.json(rooms);
});


/* ================= BOOKING ================= */

// BOOK BED (SAFE)
app.post("/api/book", async (req, res) => {
    try {
        const { roomId, bedNumber, userId, checkIn, checkOut } = req.body;

        const room = await Room.findOneAndUpdate(
            {
                _id: roomId,
                "beds.bedNumber": bedNumber,
                "beds.isBooked": false
            },
            {
                $set: { "beds.$.isBooked": true }
            },
            { new: true }
        );

        if (!room) {
            return res.json({ msg: "Bed already booked ❌" });
        }

        const days = Math.ceil(
            (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
        );

        const totalAmount = days * room.price;

        await User.findByIdAndUpdate(userId, {
            roomId,
            bedNumber
        });

        const booking = new Booking({
            userId,
            roomId,
            bedNumber,
            checkIn,
            checkOut,
            totalAmount
        });

        await booking.save();

        res.json({ msg: "Booking successful ✅", totalAmount });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// MY BOOKING
app.get("/api/my-booking/:userId", async (req, res) => {
    const booking = await Booking.findOne({ userId: req.params.userId })
        .populate("roomId");

    res.json(booking);
});


/* ================= CHECKOUT ================= */

app.post("/api/checkout", async (req, res) => {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.json({ msg: "Booking not found ❌" });

    await Room.updateOne(
        { _id: booking.roomId, "beds.bedNumber": booking.bedNumber },
        { $set: { "beds.$.isBooked": false } }
    );

    booking.status = "completed";
    await booking.save();

    res.json({ msg: "Checked out successfully ✅" });
});


/* ================= PAYMENT ================= */

app.post("/api/payment", async (req, res) => {
    const { userId, bookingId, amount, method } = req.body;

    const payment = new Payment({
        userId,
        bookingId,
        amount,
        paymentMethod: method,
        status: "paid",
        paidAt: new Date()
    });

    await payment.save();

    await Booking.findByIdAndUpdate(bookingId, { paymentStatus: "paid" });

    res.json({ msg: "Payment successful 💰" });
});

app.get("/api/payment/:userId", async (req, res) => {
    const payments = await Payment.find({ userId: req.params.userId });
    res.json(payments);
});


/* ================= ADMIN STATS ================= */

app.get("/api/stats", async (req, res) => {
    const totalRooms = await Room.countDocuments();
    const totalUsers = await User.countDocuments();
    const activeBookings = await Booking.countDocuments({ status: "active" });

    res.json({
        totalRooms,
        totalUsers,
        activeBookings
    });
});


/* ================= SERVER ================= */

app.listen(5000, () => {
    console.log("Server running on port 5000 🚀");
>>>>>>> f7803f9bcb23a6d8fbd08e2866ec52ba25d7b710
});