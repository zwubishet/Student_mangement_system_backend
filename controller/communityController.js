import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// POST community post
const CommunityPost = async (req, res) => {
  const { title, content, type, image, document } = req.body;
  const studentId = req.user.studentId;

  try {
    if (!title || !content || !type || !studentId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const studentExists = await prisma.student.findUnique({
      where: { studentId }
    });

    if (!studentExists) {
      return res.status(404).json({ message: "Student not found" });
    }

    const post = await prisma.communityPost.create({
      data: {
        id,
        title,
        content,
        type,
        image,
        document,
        studentId: studentExists.id,
      }
    });

    res.status(201).json(post);
  } catch (err) {
    console.error("Error creating community post:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
};

// GET all posts
const GetCommunityPost = async (req, res) => {
  try {
    const posts = await prisma.communityPost.findMany();
    res.json(posts);
  } catch (err) {
    console.error("Error fetching community posts:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
};

// GET posts by type
const FilterCommunityPost = async (req, res) => {
  const type = req.params.type;

  try {
    const filteredPosts = await prisma.communityPost.findMany({
      where: { type },
      select: {
        title: true,
        content: true,
        type: true,
        image: true,
        document: true,
        studentId: true
      }
    });

    res.json(filteredPosts);
  } catch (err) {
    console.error("Error filtering community posts:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
};

const MyPost = async (req, res) => {
  try {
    const { studentId } = req.user;

    const student = await prisma.student.findUnique({
      where: { studentId },
      select: { id: true, fullName: true }
    });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const myPost = await prisma.communityPost.findMany({
      where: {
        studentId: student.id
      },
      select: {
        title: true,
        content: true,
        type: true,
        image: true,
        document: true,
        createdAt: true
      }
    });

    if (!myPost.length) {
      return res.status(200).json({
        message: `${student.fullName}, you have no posts yet.`
      });
    }

    res.status(200).json({
      owner: student.fullName,
      posts: myPost
    });

  } catch (err) {
    console.error("Error fetching student's posts:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
};

const UpdatePost = async (req, res) => {
  try {
    const postId = req.params.postId;
    const studentId = req.user.studentId;
    const { title, content, type, image, document } = req.body;

    if (!req.body) {
      return res.status(400).json({ message: "No data provided" });
    }

    const post = await prisma.communityPost.findUnique({
      where: { id: postId }
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const student = await prisma.student.findUnique({
      where: { studentId }
    });

    if (!student || post.studentId !== student.id) {
      return res.status(403).json({ message: "Unauthorized to update this post" });
    }

    const updatedPost = await prisma.communityPost.update({
      where: { id: postId },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(type && { type }),
        ...(image && { image }),
        ...(document && { document }),
      },
    });

    res.status(200).json(updatedPost);
  } catch (err) {
    console.error("Error updating post:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
};

const DeletePost = async (req, res) => {
  try {
    const postId = req.params.postId;
    const studentId = req.user.studentId;

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const student = await prisma.student.findUnique({
      where: { studentId }
    });

    if (!student || post.studentId !== student.id) {
      return res.status(403).json({ message: "Unauthorized to delete this post" });
    }

    
    await prisma.communityPost.delete({
      where: { id: postId },
    });

    res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ message: `Error: ${err.message}` });
  }
};


export default {
  CommunityPost,
  GetCommunityPost,
  FilterCommunityPost,
  MyPost,
  UpdatePost,
  DeletePost
};
