const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { response } = require("express");
require("dotenv").config();
var jwt = require("jsonwebtoken");
const res = require("express/lib/response");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server Is Running");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6nnj1.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access!" });
  }
  const tkn = authHeader.split(" ")[1];
  jwt.verify(tkn, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden Access!" });
    }
    req.decoded = decoded;
    next();
  });
};
async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctors-portal-db")
      .collection("services");
    const userCollection = client.db("doctors-portal-db").collection("users");
    const bookingCollection = client
      .db("doctors-portal-db")
      .collection("bookings");
    app.get("/services", async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query);
      const services = await cursor.toArray();
      res.send(services);
    });
    //Inserting a booking
    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      //Preventing same user booking same service
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        patient: booking.patient,
        email: booking.email,
        price: booking.price,
      };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }

      const result = await bookingCollection.insertOne(booking);
      return res.send({ success: true, result });
    });

    //available
    app.get("/available", async (req, res) => {
      const date = req.query.date || "May 15, 2022";

      //Find all the services
      const services = await serviceCollection.find().toArray();
      //Get the all bookings of that day
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      //For each service find bookings for that service
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (b) => b.treatment === service.name
        );

        const booked = serviceBookings.map((s) => s.slot);
        const available = service.slots.filter(
          (slot) => !booked.includes(slot)
        );
        service.slots = available;
      });
      res.send(services);
    });

    //For dashboard booking data load
    app.get("/bookings", verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { email: patient };
        const bookings = await bookingCollection.find(query).toArray();

        res.send(bookings);
      } else {
        return res.status(403).send({ message: "Forbidden Access!" });
      }
    });

    //User Updating
    app.put("/user/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const option = { upsert: true };
      const updatedDoc = {
        $set: {
          user,
        },
      };
      var token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      const result = await userCollection.updateOne(filter, updatedDoc, option);
      res.send({ result, token });
    });
    //loading all users data
    app.get("/users", verifyJWT, async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    //Checking user whether he is an admin or not
    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });

      const isAdmin = user.role === "admin";

      res.send({ admin: isAdmin });
    });

    //Making Admin
    app.put("/user/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role === "admin") {
        const filter = { email: email };

        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };

        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "Forbidden!" });
      }
    });
    //Get the booking Id for payment
    app.get("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });
    //Payment Gateway Api
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      console.log(amount);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
      // res.send(service);
    });
  } finally {
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log("Server Running");
});
