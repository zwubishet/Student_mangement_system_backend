import jwt from 'jsonwebtoken';
import client from '../../hasuraClient.js';
import pkg from '@apollo/client';
const { gql } = pkg;
import { generateAccessToken, generateRefreshToken } from '../../util/jwt.js';

export const refreshToken = async (req, res) => {
  console.log("🔥=== REFRESH HANDLER ===");
  console.log("🔥 req.body (RAW):", req.body);
  
  // ✅ SAME DOUBLE-NESTING FIX as login/register!
  let finalInput = req.body.input?.input || req.body.input || req.body;
  const { token } = finalInput || {};

  console.log("✅ FINAL EXTRACTED TOKEN:", token ? `${token.slice(0,20)}...` : 'MISSING');
  
  console.log("✅ EXTRACTED TOKEN:", token ? `${token.slice(0,20)}...` : 'MISSING');

  // ✅ Input validation
  if (!token?.trim()) {
    return res.status(400).json({ 
      success: false,
      message: "Refresh token required" 
    });
  }

  try {
    // ✅ 1. Validate refresh token exists in DB
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
      variables: { token: token.trim() }, 
      fetchPolicy: 'no-cache' 
    });
    
    const storedToken = storedResp?.data?.refresh_tokens?.[0];
    if (!storedToken) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid refresh token" 
      });
    }

    // ✅ Check expiration
    const now = new Date();
    const expiresAt = new Date(storedToken.expires_at);
    if (now > expiresAt) {
      // Cleanup expired token
      const DELETE_EXPIRED = gql`
        mutation DeleteExpired($token: String!) {
          delete_refresh_tokens(where: { token: { _eq: $token } }) {
            affected_rows
          }
        }
      `;
      await client.mutate({ 
        mutation: DELETE_EXPIRED, 
        variables: { token: token.trim() } 
      });
      
      return res.status(401).json({ 
        success: false,
        message: "Refresh token expired" 
      });
    }

    // ✅ 2. Verify JWT signature
    const decoded = jwt.verify(token.trim(), process.env.REFRESH_TOKEN_SECRET);
    
    // ✅ 3. Validate user still exists
    const GET_USER = gql`
      query GetUser($userId: uuid!) {
        users_by_pk(id: $userId) {
          id
          role
          school_id
        }
      }
    `;
    
    const userResp = await client.query({ 
      query: GET_USER, 
      variables: { userId: decoded.userId }, 
      fetchPolicy: 'no-cache' 
    });
    
    if (!userResp.data.users_by_pk) {
      return res.status(401).json({ 
        success: false,
        message: "User not found" 
      });
    }

    // ✅ 4. Build secure payload
    const payload = {
      userId: decoded.userId,
      role: decoded.role || userResp.data.users_by_pk.role,
      ...(decoded.schoolId || userResp.data.users_by_pk.school_id && { schoolId: decoded.schoolId || userResp.data.users_by_pk.school_id })
    };
    
    // ✅ 5. Generate NEW tokens (rotation)
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    console.log("✅ Generated new tokens for user:", payload.userId);

    // ✅ 6. Rotate refresh token (delete old, insert new)
    const ROTATE_REFRESH = gql`
      mutation RotateRefresh($oldToken: String!, $newToken: String!, $userId: uuid!) {
        delete_refresh_tokens(where: { token: { _eq: $oldToken } }) {
          affected_rows
        }
        insert_refresh_tokens_one(object: { 
          token: $newToken, 
          user_id: $userId 
        }) {
          id
        }
      }
    `;
    
    await client.mutate({ 
      mutation: ROTATE_REFRESH, 
      variables: { 
        oldToken: token.trim(), 
        newToken: newRefreshToken, 
        userId: decoded.userId 
      } 
    });

    console.log(`✅ Token rotation success for user: ${decoded.userId}`);

    // ✅ Hasura Action Response Format
    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (err) {
    console.error("Refresh token error:", {
      message: err.message,
      tokenPreview: token?.slice(0, 20) + '...'
    });
    
    return res.status(401).json({ 
      success: false,
      message: "Invalid refresh token" 
    });
  }
};
