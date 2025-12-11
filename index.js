const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const admin = require("firebase-admin");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const crypto = require("crypto");

const port = process.env.PORT || 3000;



const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8')
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//middleware
app.use(express.json());
app.use(cors());

//firebase token verify
const veryfyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  try {
    const idToken = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    // console.log(decoded);
    req.decoded_email = decoded.email;
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  next();
};

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
    // await client.connect();

    const db = client.db("book_courier");
    const usersCollection = db.collection("users");
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");
    const paymentsCollection = db.collection("payments");
    const wishlistCollection = db.collection("wishlist");
    const reviewCollection = db.collection("reviews");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      // console.log(user);

      if (user.role !== "admin") {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      next();
    };
    const verifyLibrarian = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      // console.log(user);

      if (user.role !== "librarian") {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      next();
    };
    const verifyUser = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      // console.log(user);

      if (user.role !== "user") {
        return res.status(401).send({ message: "Unauthorized access" });
      }

      next();
    };

    //payment stripe
    app.post("/payment-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      amount = parseInt(paymentInfo.cost) * 100;
      // console.log(amount, paymentInfo);

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: `please pay`,
              },
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: { orderId: paymentInfo.id, bookname: paymentInfo.bookname },
        customer_email: paymentInfo.buyerEmail,
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancled`,
      });
      // console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/session-status", async (req, res) => {
      const sessionId = req.query.session_id;

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      console.log(session);
      const transactionId = session.payment_intent;

      console.log("transiction id prothome", transactionId);

      const existingPayment = await paymentsCollection.findOne({
        transactionId,
      });

      if (existingPayment) {
        console.log("existing payment id", existingPayment);
        return res.send({ message: "already exist", transactionId });
      }

      const query = { transactionId: transactionId };

      if (session.payment_status === "paid") {
        const orderId = session.metadata.orderId;
        const query = { _id: new ObjectId(orderId) };
        const update = {
          $set: {
            payment: "paid",
          },
        };

        const result = await ordersCollection.updateOne(query, update);

        const payment = {
          transactionId: transactionId,
          email: session.customer_details.email,
          bookname: session.metadata.bookname,
          amount: session.amount_total / 100,
          date: new Date().toLocaleDateString(),
        };

        if (!existingPayment) {
          const result = await paymentsCollection.insertOne(payment);
        }

        res.send({
          transactionId: session.payment_intent,
        });
      }

      // res.send({
      //   status: session.payment_status,
      // paymentId: session.payment_intent
      //   customer_email: session.customer_details.email,
      // });

      // console.log(session);
    });

    //payment collection api
    app.get(
      "/payments/:email",
      veryfyFirebaseToken,
      verifyUser,
      async (req, res) => {
        const email = req.params.email;
        const query = {};
        if (email) {
          query.email = email;
        }
        const result = await paymentsCollection.find(query).toArray();
        res.send(result);
      }
    );

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

    app.get(
      "/alluser/:email",
      veryfyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const query = { email };
        const checkAdmin = await usersCollection.findOne(query);

        if (checkAdmin.role !== "admin") {
          return res.send({ message: "forbidden access" });
        }

        const allUser = await usersCollection.find().toArray();

        res.send(allUser);
      }
    );

    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);

      res.send({ role: user?.role || "user" });
    });

    app.patch(
      "/update-user/:id",
      veryfyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    //book related api
    app.post(
      "/books",
      veryfyFirebaseToken,
      verifyLibrarian,
      async (req, res) => {
        const bookInfo = req.body;
        if (bookInfo) {
          bookInfo.date = new Date();
        }
        const result = await booksCollection.insertOne(bookInfo);
        res.send(result);
      }
    );

    app.get("/allbooks", async (req, res) => {
      const searchText = req.query.searchText;
      console.log(searchText);
      const query = {};

      if (searchText) {
        query.$or = [
          {
            bookname: { $regex: searchText, $options: "i" },
          },
        ];
      }

      const cursor = booksCollection.find(query);

      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/libraian-books/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };

      const cursor = booksCollection.find(query);

      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/book-edit/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    app.patch(
      "/books-edit/:id",
      veryfyFirebaseToken,
      verifyLibrarian,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateInfo = req.body;
        // console.log(updateInfo);
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
        // console.log(result);
        res.send(result);
      }
    );
    app.patch(
      "/books-update/:id",
      veryfyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateInfo = req.body;
        const update = {
          $set: {
            status: updateInfo.status,
          },
        };

        const result = await booksCollection.updateOne(query, update);
        // console.log(result);
        res.send(result);
      }
    );

    app.delete(
      "/delete-book/:id",
      veryfyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };

        const result = await booksCollection.deleteOne(query);
        res.send(result);
      }
    );

    //orders related api
    app.post("/order", veryfyFirebaseToken, async (req, res) => {
      const order = req.body;
      if (order) {
        order.status = "pending";
        order.payment = "unpaid";
      }

      const result = await ordersCollection.insertOne(order);
      res.send(result);
    });

    app.get(
      "/myorder/:email",
      veryfyFirebaseToken,
      verifyUser,
      async (req, res) => {
        const email = req.params.email;
        const query = { email };

        const result = await ordersCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.patch(
      "/update-order/:id",
      veryfyFirebaseToken,

      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updateStatus = req.body;
        const update = {
          $set: {
            status: updateStatus.status,
          },
        };

        const result = await ordersCollection.updateOne(query, update);
        res.send(result);
      }
    );

    app.delete(
      "/delete-order/:id",
      veryfyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = {
          bookId: id,
        };

        const result = await ordersCollection.deleteOne(query);
        res.send(result);
      }
    );

    //all ordered book
    app.get(
      "/all-order-book",
      veryfyFirebaseToken,
      verifyLibrarian,
      async (req, res) => {
        const result = await ordersCollection.find().toArray();
        res.send(result);
      }
    );

    app.post(
      "/user-wishlist/:email",
      veryfyFirebaseToken,

      async (req, res) => {
        const bookInfo = req.body;
        const email = req.params.email;
        if (email) {
          bookInfo.email = email;
        }
        const result = await wishlistCollection.insertOne(bookInfo);
        res.send(result);
      }
    );

    app.get("/mywishlist-get/:email", veryfyFirebaseToken, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await wishlistCollection.find(query).toArray();

      res.send(result);
    });

    app.post("/review", async (req, res) => {
      const review = req.body;
      const result = await reviewCollection.insertOne(review);

      res.send(result);
    });

    app.get("/reviews/:id", async (req, res) => {
      const id = req.params.id;
      const query = { bookId: id };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/latest-book", async (req, res) => {
      const cursor = booksCollection.find().sort({ date: -1 }).limit(4);

      const result = await cursor.toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
