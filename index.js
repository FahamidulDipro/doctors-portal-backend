const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
const { response } = require("express");
require("dotenv").config();
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

async function run() {
  try {
    await client.connect();
    const serviceCollection = client
      .db("doctors-portal-db")
      .collection("services");

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
    app.get("/bookings", async (req, res) => {
      const patient = req.query.patient;
      const query = { email: patient };
      // console.log(patient);
      const bookings = await bookingCollection.find(query).toArray();
      console.log(bookings);
      res.send(bookings);
    });
  } finally {
  }
}
run().catch(console.dir);
app.listen(port, () => {
  console.log("Server Running");
});
