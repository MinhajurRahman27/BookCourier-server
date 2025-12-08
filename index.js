const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 3000;

//middleware
app.use(express.json());
app.use(cors());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3f7kxdk.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("book_courier");
    const usersCollection = db.collection("users");
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");

    //user api
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const email = userInfo.email;
      userInfo.role = "user";
      userInfo.createdAt = new Date();

      const existingEmail = await usersCollection.findOne({ email });
      if (existingEmail) {
        return res.send({ message: "user already exist" });
      }
      const result = await usersCollection.insertOne(userInfo);
      res.send(result);
    });

    app.get("/alluser/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const checkAdmin = await usersCollection.findOne(query);

      if (checkAdmin.role !== "admin") {
        return res.send({ message: "forbidden access" });
      }

      const allUser = await usersCollection.find().toArray();

      res.send(allUser);
    });

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      res.send({ role: user?.role || "user" });
    });

    app.patch("/update-user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateInfo = req.body;
      const update = {
        $set: {
          role: updateInfo.role,
        },
      };

      const result = await usersCollection.updateOne(query, update);
      res.send(result);
    });

    //book related api
    app.post("/books", async (req, res) => {
      const bookInfo = req.body;
      const result = await booksCollection.insertOne(bookInfo);
      res.send(result);
    });

    app.get("/allbooks", async (req, res) => {
      const result = await booksCollection.find().toArray();
      res.send(result);
    });

    app.get("/book-edit/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    app.patch("/books-edit/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateInfo = req.body;
      console.log(updateInfo);
      const update = {
        $set: {
          bookname: updateInfo.bookname,
          bookimage: updateInfo.bookimage,
          author: updateInfo.author,
          status: updateInfo.status,
          price: updateInfo.price,
        },
      };

      const result = await booksCollection.updateOne(query, update);
      console.log(result);
      res.send(result);
    });
    app.patch("/books-update/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updateInfo = req.body;
      const update = {
        $set: {
          status: updateInfo.status,
        },
      };

      const result = await booksCollection.updateOne(query, update);
      console.log(result);
      res.send(result);
    });

    app.delete("/delete-book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await booksCollection.deleteOne(query);
      res.send(result);
    });

    //orders related api
    app.post("/order", async (req, res) => {
      const order = req.body;
      if (order) {
        order.status = "pending";
        order.payment = "unpaid";
      }

      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.get("/myorder/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };

      const result = await ordersCollection.find(query).toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Book courier is live!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
