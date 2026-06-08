const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const port = process.env.PORT || 3000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(express.json())
// app.use(cors())

app.use(cors({
    origin: ['https://alumni-4-task-server.onrender.com', 'http://localhost:5173'],
    credentials: true,
    optionalSuccessStatus: 200
}))




const uri = `mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0-shard-00-00.xdjfp.mongodb.net:27017,cluster0-shard-00-01.xdjfp.mongodb.net:27017,cluster0-shard-00-02.xdjfp.mongodb.net:27017/?ssl=true&replicaSet=atlas-kgt0co-shard-0&authSource=admin&appName=Cluster0`;
// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xdjfp.mongodb.net/?appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('alumni-4')
    const users = db.collection('users')
    const projectsCollection = db.collection('projects')
    const taskCollection = db.collection('tasks')

    app.get('/test-env', (req, res) => {
  res.send({
    user: process.env.DB_USER,
    pass: process.env.DB_PASS
  })
})

    app.post('/user', async (req, res) => {
      const userData = req.body
      // console.log(data)
      const result = await users.insertOne(userData)
      // console.log(userData)
      res.send(result)
    })


    // app.get('/projects', async (req, res) => {
    //   const result = await projectsCollection.find().toArray()
    //   res.send(result)
    // })

    app.get('/users/:email/role', async (req, res) => {
      const email = req.params?.email;
      const query = { email }
      const user = await users.findOne(query)
      res.send({ role: user?.role } || 'user-server')
      // console.log(user)
    })

    app.get('/allTasks', async (req, res) => {
      const result = await taskCollection.find().toArray();
      res.send(result);
    });

    app.get('/projects', async (req, res) => {

      const {
        status,
        deadlineStatus,
        search,
        sort
      } = req.query;

      const query = {};

      // Search by project name
      if (search) {
        query.projectName = {
          $regex: search,
          $options: 'i'
        };
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      let projects = await projectsCollection
        .find(query)
        .toArray();

      // Deadline Filter
      if (deadlineStatus) {

        const today = new Date();

        projects = projects.filter(project => {

          const deadline =
            new Date(project.deadline);

          if (deadlineStatus === 'Upcoming') {
            return deadline >= today;
          }

          if (deadlineStatus === 'Overdue') {
            return deadline < today;
          }

          return true;
        });
      }

      // Sort By Deadline
      if (sort === 'deadline') {

        projects.sort(
          (a, b) =>
            new Date(a.deadline) -
            new Date(b.deadline)
        );
      }

      res.send(projects);
    });

    app.post('/projects', async (req, res) => {
      const projectData = req.body
      const result = await projectsCollection.insertOne(projectData)
      res.send(result)
      // console.log(userData)
    })

    app.delete('/projects/:id', async (req, res) => {


      const { id } = req.params;

      const result = await projectsCollection.deleteOne({
        _id: new ObjectId(id)
      });

      res.send(result)
    })


    app.patch('/projects/:id', async (req, res) => {


      const { id } = req.params;
      const updatedData = req.body;
      const query = { _id: new ObjectId(id) }

      const result = await projectsCollection.updateOne(
        query,
        {
          $set: {
            projectName: updatedData.projectName,
            description: updatedData.description,
            deadline: updatedData.deadline,
            status: updatedData.status,
            updatedAt: new Date()
          }
        }
      );

      res.send(result);


    });


    app.patch('/projects/add-member/:id', async (req, res) => {


      const { id } = req.params;
      const { member } = req.body;

      const project = await projectsCollection.findOne({
        _id: new ObjectId(id)
      });

      if (!project) {
        return res.send({
          message: "Project not found"
        });
      }

      if (
        project.teamMembers?.includes(member)
      ) {
        return res.send({
          message: "Member already exists"
        });
      }

      const result =
        await projectsCollection.updateOne(
          {
            _id: new ObjectId(id)
          },
          {
            $push: {
              teamMembers: member
            }
          }
        );

      res.send(result);
    });

    app.post('/tasks', async (req, res) => {
      try {
        const task = req.body;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const deadline = new Date(task.dueDate);

        if (isNaN(deadline.getTime())) {
          return res.status(400).send({
            success: false,
            message: "Invalid deadline date."
          });
        }

        deadline.setHours(0, 0, 0, 0);

        if (deadline < today) {
          return res.status(400).send({
            success: false,
            message: "Please select a valid deadline."
          });
        }

        const existingTask = await taskCollection.findOne({
          projectID: task.projectID,
          taskTitle: task.taskTitle.trim()
        });

        if (existingTask) {
          return res.status(400).send({
            success: false,
            message: "This task already exists in the project."
          });
        }

        // console.log(task.projectID);
        // console.log(task.taskTitle);

        const result = await taskCollection.insertOne({
          ...task,
          taskTitle: task.taskTitle.trim(),
          createdAt: new Date()
        });

        res.send({
          success: true,
          acknowledged: result.acknowledged,
          insertedId: result.insertedId
        });

      } catch (error) {
        console.error(error);

        res.status(500).send({
          success: false,
          message: "Internal Server Error"
        });
      }
    });


    app.patch('/tasks/status/:id', async (req, res) => {

      const { id } = req.params;
      const { status } = req.body;

      const result = await taskCollection.updateOne(
        {
          _id: new ObjectId(id)
        },
        {
          $set: {
            status,
            updatedAt: new Date()
          }
        }
      );

      res.send({
        success: true,
        modifiedCount: result.modifiedCount
      });


    });

    app.get('/tasks', async (req, res) => {

      try {

        const {
          status,
          priority,
          assignedMember,
          search,
          deadlineStatus,
          sort
        } = req.query;

        const query = {};

        // Status Filter

        if (status?.trim()) {
          query.status = status.trim();
        }

        // Priority Filter

        if (priority?.trim()) {
          query.priority = priority.trim();
        }

        // Assigned Member Search

        if (assignedMember?.trim()) {

          query.assignedMember = {
            $regex: assignedMember.trim(),
            $options: "i"
          };

        }

        // Task Title / Description Search

        if (search?.trim()) {

          query.$or = [

            {
              taskTitle: {
                $regex: search.trim(),
                $options: "i"
              }
            },

            {
              description: {
                $regex: search.trim(),
                $options: "i"
              }
            }

          ];
        }

        let tasks =
          await taskCollection
            .find(query)
            .toArray();

        // Upcoming / Overdue

        if (deadlineStatus) {

          const today = new Date();

          today.setHours(
            0,
            0,
            0,
            0
          );

          tasks = tasks.filter(task => {

            const dueDate =
              new Date(task.dueDate);

            dueDate.setHours(
              0,
              0,
              0,
              0
            );

            if (
              deadlineStatus ===
              "Upcoming"
            ) {
              return dueDate >= today;
            }

            if (
              deadlineStatus ===
              "Overdue"
            ) {
              return dueDate < today;
            }

            return true;
          });
        }

        // Sorting

        if (sort === "deadline") {

          tasks.sort((a, b) =>
            new Date(a.dueDate) -
            new Date(b.dueDate)
          );

        }

        if (sort === "latest") {

          tasks.sort((a, b) =>
            new Date(
              b.createdAt || 0
            ) -
            new Date(
              a.createdAt || 0
            )
          );

        }

        if (sort === "updated") {

          tasks.sort((a, b) =>
            new Date(
              b.updatedAt || 0
            ) -
            new Date(
              a.updatedAt || 0
            )
          );

        }

        if (sort === "priority") {

          const priorityOrder = {
            High: 1,
            Medium: 2,
            Low: 3
          };

          tasks.sort((a, b) =>
            priorityOrder[
            a.priority
            ] -
            priorityOrder[
            b.priority
            ]
          );
        }

        res.send(tasks);

      } catch (error) {

        console.log(error);

        res.status(500).send({
          success: false,
          message:
            'Internal Server Error'
        });

      }
    });

    app.patch('/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const updatedTask = req.body;

      // console.log(updatedTask)

      const query = {
        _id: new ObjectId(id)
      };

      const updateDoc = {
        $set: {
          taskTitle: updatedTask.taskTitle,
          description: updatedTask.description,
          assignedMember: updatedTask.assignedMember,
          dueDate: updatedTask.dueDate,
          priority: updatedTask.priority,
          status: updatedTask.status
        }
      };


      const result = await taskCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    app.delete("/tasks/:id", async (req, res) => {

      const id = req.params.id;

      const query = {
        _id: new ObjectId(id)
      };

      const result = await taskCollection.deleteOne(query);

      res.send(result);
    });

    app.get('/workload-summary', async (req, res) => {

      const result = await taskCollection.aggregate([
        {
          $group: {
            _id: "$assignedMember",

            totalTasks: {
              $sum: 1
            },

            completedTasks: {
              $sum: {
                $cond: [
                  { $eq: ["$status", "Completed"] },
                  1,
                  0
                ]
              }
            },

            pendingTasks: {
              $sum: {
                $cond: [
                  { $ne: ["$status", "Completed"] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            member: "$_id",
            totalTasks: 1,
            completedTasks: 1,
            pendingTasks: 1
          }
        }
      ]).toArray();

      res.send(result);
    });

    app.get('/dashboard-stats', async (req, res) => {

      const totalProjects =
        await projectsCollection.countDocuments();

      const totalTasks =
        await taskCollection.countDocuments();

      const completedTasks =
        await taskCollection.countDocuments({
          status: "Completed"
        });

      const pendingTasks =
        await taskCollection.countDocuments({
          status: {
            $in: ["Todo", "In Progress"]
          }
        });

      const overdueTasks =
        await taskCollection.countDocuments({
          status: {
            $ne: "Completed"
          },
          dueDate: {
            $lt: new Date().toISOString().split("T")[0]
          }
        });

      res.send({
        totalProjects,
        totalTasks,
        completedTasks,
        pendingTasks,
        overdueTasks
      });
    });

    app.get('/project-summary', async (req, res) => {

      const projects = await projectsCollection.find().toArray();

      const summary = await Promise.all(
        projects.map(async (project) => {

          const tasks = await taskCollection.find({
            projectID: project._id.toString()
          }).toArray();

          const totalTasks = tasks.length;

          const completedTasks = tasks.filter(
            task => task.status === "Completed"
          ).length;

          const pendingTasks = totalTasks - completedTasks;

          const completedPercentage =
            totalTasks === 0
              ? 0
              : Math.round(
                (completedTasks / totalTasks) * 100
              );

          const today = new Date();

          const deadline = new Date(project.deadline);

          const daysLeft = Math.ceil(
            (deadline - today) /
            (1000 * 60 * 60 * 24)
          );

          return {
            _id: project._id,
            projectName: project.projectName,
            pendingTasks,
            completedPercentage,
            daysLeft
          };
        })
      );

      res.send(summary);
    });


    app.get('/analytics/task-priority', async (req, res) => {

      const high = await taskCollection.countDocuments({
        priority: "High"
      });

      const medium = await taskCollection.countDocuments({
        priority: "Medium"
      });

      const low = await taskCollection.countDocuments({
        priority: "Low"
      });

      res.send([
        {
          name: "High",
          value: high
        },
        {
          name: "Medium",
          value: medium
        },
        {
          name: "Low",
          value: low
        }
      ]);
    });

    app.get('/analytics/task-status', async (req, res) => {

      const todo =
        await taskCollection.countDocuments({
          status: "Todo"
        });

      const progress =
        await taskCollection.countDocuments({
          status: "In Progress"
        });

      const completed =
        await taskCollection.countDocuments({
          status: "Completed"
        });

      res.send([
        {
          status: "Todo",
          count: todo
        },
        {
          status: "In Progress",
          count: progress
        },
        {
          status: "Completed",
          count: completed
        }
      ]);
    });

    app.get('/analytics/team-productivity', async (req, res) => {

      const result =
        await taskCollection.aggregate([
          {
            $match: {
              status: "Completed"
            }
          },
          {
            $group: {
              _id: "$assignedMember",
              completedTasks: {
                $sum: 1
              }
            }
          }
        ]).toArray();

      res.send(result);
    });

    app.get('/analytics/project-progress', async (req, res) => {

      const projects =
        await projectsCollection.find().toArray();

      const result =
        await Promise.all(

          projects.map(async project => {

            const tasks =
              await taskCollection.find({
                projectID:
                  project._id.toString()
              }).toArray();

            const total =
              tasks.length;

            const completed =
              tasks.filter(
                t =>
                  t.status === "Completed"
              ).length;

            return {
              projectName:
                project.projectName,

              progress:
                total === 0
                  ? 0
                  : Math.round(
                    completed * 100 / total
                  )
            };
          })
        );

      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  }
  finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

module.exports = app;