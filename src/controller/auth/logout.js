// resolve hasuraClient from project root `src/` directory
import client from '../../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;


export const logout = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: "Refresh token required for logout" });
  }

  try {
    // Delete refresh token from database
    const DELETE_REFRESH = gql`
      mutation DeleteRefresh($token: String!) {
        delete_refresh_tokens(where: { token: { _eq: $token } }) {
          affected_rows
        }
      }
    `;
    
    const result = await client.mutate({ 
      mutation: DELETE_REFRESH, 
      variables: { token } 
    });

    if (result.data.delete_refresh_tokens.affected_rows > 0) {
      return res.json({ message: "Logged out successfully" });
    } else {
      return res.status(404).json({ message: "Refresh token not found" });
    }

  } catch (err) {
    console.error("Logout error:", err.message);
    return res.status(500).json({ message: "Logout failed" });
  }
};