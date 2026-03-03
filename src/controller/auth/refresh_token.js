import jwt from 'jsonwebtoken';
// helper to create tokens with Hasura claims
import { generateAccessToken } from '../../util/jwt.js';
// correct path to the hasura client module
import client from '../../hasuraClient.js';
import pkg_apollo from '@apollo/client';
const { gql } = pkg_apollo;

export const refreshToken = async (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(401).json({ message: "Refresh token required" });

  try {
    // 1. Validate refresh token exists in DB
    const GET_REFRESH = gql`
      query GetRefresh($token: String!) {
        refresh_tokens(where: { token: { _eq: $token } }) {
          id
          token
          user_id
          expires_at
        }
      }
    `;
    
    const storedResp = await client.query({ 
      query: GET_REFRESH, 
      variables: { token }, 
      fetchPolicy: 'no-cache' 
    });
    
    const storedToken = storedResp?.data?.refresh_tokens?.[0];
    if (!storedToken || new Date(storedToken.expires_at) < new Date()) {
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // 2. Verify JWT signature
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    
    // 3. Generate new access token. Include any existing schoolId in the refresh payload.
    const newAccessToken = generateAccessToken({
      userId: decoded.userId,
      role: decoded.role,
      schoolId: decoded.schoolId
    });

    return res.json({ accessToken: newAccessToken });

  } catch (err) {
    console.error("Refresh token error:", err.message);
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};